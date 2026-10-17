'use strict';
/**
 * PostgreSQL backend for lib/storage.js (used when DATABASE_URL is set).
 *
 * The app keeps all data in memory, exactly as with JSON files. Each write runs in one
 * database transaction that:
 *   1. takes a PostgreSQL advisory lock, so writes from several servers never interleave;
 *   2. reloads everything if another server changed the data since we last loaded it;
 *   3. applies the change and writes only the rows that differ (insert/update/delete);
 *   4. bumps storage_meta.version, so other servers know to reload.
 * Before each API request, refreshIfStale() reloads when the version has changed.
 */
const { PrismaClient } = require('@prisma/client');
const { ARRAY_MAPS, OBJECT_MAPS, WRITE_ORDER } = require('./rowMaps');

const LOCK_KEY = 726354101; // arbitrary constant identifying the feedback system's write lock
const TX_OPTIONS = { maxWait: 20000, timeout: 60000 };

let prisma = null;
let loadedVersion = -1;

async function connect() {
  prisma = new PrismaClient();
  await prisma.$connect();
  await prisma.storageMeta.upsert({ where: { id: 1 }, create: { id: 1, version: 0 }, update: {} });
}

async function disconnect() {
  if (prisma) await prisma.$disconnect();
}

async function readVersion(client) {
  const meta = await client.storageMeta.findUnique({ where: { id: 1 } });
  return meta ? meta.version : 0;
}

/** Reads every table and returns { collectionName: data }. */
async function loadAll(client) {
  const data = {};
  for (const [name, map] of Object.entries(ARRAY_MAPS)) {
    const rows = await client[map.model].findMany({ orderBy: { id: 'asc' } });
    data[name] = rows.map(map.fromRow);
  }
  // Keep insertion order (oldest first) like the JSON files, which the dashboard relies on.
  data.submissions.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  data.students.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  data.winners.sort((a, b) => a.declaredAt.localeCompare(b.declaredAt));
  for (const name of ['questions', 'attributes', 'prizes']) {
    data[name].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  }
  for (const [name, map] of Object.entries(OBJECT_MAPS)) {
    const row = await client[map.model].findUnique({ where: { id: 1 } });
    data[name] = row ? map.fromRow(row) : {};
  }
  return data;
}

async function loadInto(cache, client = prisma) {
  const version = await readVersion(client);
  const data = await loadAll(client);
  for (const [name, value] of Object.entries(data)) cache.set(name, value);
  loadedVersion = version;
}

async function refreshIfStale(cache) {
  if ((await readVersion(prisma)) !== loadedVersion) await loadInto(cache);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function writeArray(tx, name, prev, next, phase) {
  const map = ARRAY_MAPS[name];
  const model = tx[map.model];
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  if (phase === 'upsert') {
    const created = next.filter((item) => !prevById.has(item.id));
    if (created.length) await model.createMany({ data: created.map(map.toRow) });
    for (const item of next) {
      const old = prevById.get(item.id);
      if (old && !same(old, item)) await model.update({ where: { id: item.id }, data: map.toRow(item) });
    }
  } else {
    const removed = prev.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
    if (removed.length) await model.deleteMany({ where: { id: { in: removed } } });
  }
}

async function writeObject(tx, name, prev, next, phase) {
  const map = OBJECT_MAPS[name];
  if (same(prev, next)) return;
  if (phase === 'upsert' && !map.isEmpty(next)) {
    const row = map.toRow(next);
    await tx[map.model].upsert({ where: { id: 1 }, create: { id: 1, ...row }, update: row });
  } else if (phase === 'delete' && map.isEmpty(next)) {
    await tx[map.model].deleteMany({});
  }
}

async function writeChanges(tx, names, cache, drafts) {
  const ordered = WRITE_ORDER.filter((name) => names.includes(name));
  for (const phase of ['upsert', 'delete']) {
    const list = phase === 'upsert' ? ordered : [...ordered].reverse();
    for (const name of list) {
      const write = ARRAY_MAPS[name] ? writeArray : writeObject;
      await write(tx, name, cache.get(name), drafts[name], phase);
    }
  }
}

/** See lib/storage.js transaction(). Updates `cache` only after the database commit succeeded. */
async function transaction(names, fn, { cache, hasValidShape }) {
  let committed = null;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const version = await readVersion(tx);
    if (version !== loadedVersion) await loadInto(cache, tx); // another server wrote: start from its data

    const drafts = {};
    for (const name of names) drafts[name] = structuredClone(cache.get(name));
    const value = await fn(drafts);
    for (const name of names) {
      if (!hasValidShape(name, drafts[name])) throw new Error(`Refusing to write invalid data to ${name}`);
    }
    await writeChanges(tx, names, cache, drafts);
    await tx.storageMeta.update({ where: { id: 1 }, data: { version: version + 1 } });
    committed = { drafts, version: version + 1 };
    return value;
  }, TX_OPTIONS);
  for (const name of names) cache.set(name, committed.drafts[name]);
  loadedVersion = committed.version;
  return result;
}

/** Replaces all feedback data with `collections` (used by restore/import). */
async function replaceAll(collections, { cache, hasValidShape }) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
    const version = await readVersion(tx);
    const empty = Object.fromEntries(WRITE_ORDER.map((name) => [name, ARRAY_MAPS[name] ? [] : {}]));
    const current = await loadAll(tx);
    const next = { ...current, ...collections };
    for (const name of WRITE_ORDER) {
      if (!hasValidShape(name, next[name])) throw new Error(`Backup contains invalid data for ${name}`);
    }
    // Delete everything that is being replaced (children first), then insert the backup.
    const replaced = WRITE_ORDER.filter((name) => name in collections);
    const currentMap = new Map(Object.entries(current));
    await writeChanges(tx, replaced, currentMap, empty);
    await writeChanges(tx, replaced, new Map(Object.entries(empty)), next);
    await tx.storageMeta.update({ where: { id: 1 }, data: { version: version + 1 } });
  }, TX_OPTIONS);
  if (cache) await loadInto(cache);
}

module.exports = { connect, disconnect, loadInto, refreshIfStale, transaction, replaceAll, loadAll, client: () => prisma };
