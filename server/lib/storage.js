'use strict';
/**
 * Central storage. Uses PostgreSQL (via Prisma, see lib/db/prismaStore.js) when DATABASE_URL is
 * set, otherwise JSON files. Both keep the same in-memory data and the same API.
 *
 * JSON file mode:
 * - Every collection lives in its own file inside DATA_DIR (process.env.DATA_DIR || "./data").
 * - Files are loaded once at startup and kept in memory; reads never touch the disk.
 * - All writes go through a single in-process queue, so concurrent requests can never
 *   overwrite each other's changes (no lost updates).
 * - Each write goes to a temporary file which is fsync'ed and then renamed over the
 *   original, so a crash mid-write never leaves a half-written JSON file behind.
 * - Missing files are created with empty initial values; existing files are never
 *   overwritten at startup. A file with invalid JSON stops the server with a clear
 *   message instead of being silently reset.
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { PROJECT_ROOT } = require('./env');

const DEFAULT_CONFIG = {
  formTitle: 'Feedback',
  formDescription: 'Tell us about your experience. It only takes a few minutes.',
  formOpen: true,
};

const COLLECTIONS = {
  students: () => [],
  questions: () => [],
  attributes: () => [],
  submissions: () => [],
  prizes: () => [],
  winners: () => [],
  selections: () => [],
  config: () => ({ ...DEFAULT_CONFIG }),
  admin: () => ({}),
};
const COLLECTION_NAMES = Object.keys(COLLECTIONS);
const BACKUP_FORMAT = 'orange-tree-feedback-backup';
const RESTORE_FILE = 'restore-pending.json';

let dataDir = null;
let db = null; // lib/db/prismaStore when DATABASE_URL is set
// Changes on every save; pages poll it (GET /api/live) to know when to reload their data.
const bootId = crypto.randomBytes(4).toString('hex');
let localVersion = 0;
const cache = new Map();
let queue = Promise.resolve();
const writeListeners = [];

function resolveDataDir() {
  return path.resolve(PROJECT_ROOT, process.env.DATA_DIR || './data');
}

function fileFor(name) {
  return path.join(dataDir, `${name}.json`);
}

function assertKnown(name) {
  if (!COLLECTIONS[name]) throw new Error(`Unknown collection: ${name}`);
}

function hasValidShape(name, data) {
  if (Array.isArray(COLLECTIONS[name]())) return Array.isArray(data);
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw.replace(/^﻿/, ''));
}

async function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      // Windows can briefly lock a file (antivirus, indexer); retry a few times.
      if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
    }
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(JSON.stringify(data, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

function validateBundle(bundle) {
  if (!bundle || bundle.format !== BACKUP_FORMAT || typeof bundle.collections !== 'object' || !bundle.collections) {
    throw new Error('Not a valid backup file (expected format "orange-tree-feedback-backup").');
  }
  for (const [name, data] of Object.entries(bundle.collections)) {
    assertKnown(name);
    if (!hasValidShape(name, data)) throw new Error(`Backup contains invalid data for "${name}".`);
  }
  return bundle.collections;
}

// A restore is staged by `npm run restore` and applied here, before any data is loaded,
// so the running server can never overwrite restored files with its stale in-memory copy.
async function applyPendingRestore() {
  const file = path.join(dataDir, RESTORE_FILE);
  let bundle;
  try {
    bundle = await readJson(file);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw new Error(`${RESTORE_FILE} could not be read (${err.message}). Remove or fix it and restart.`);
  }
  const collections = validateBundle(bundle);
  for (const [name, data] of Object.entries(collections)) await writeAtomic(fileFor(name), data);
  await fs.rename(file, path.join(dataDir, `restore-applied-${timestamp()}.json`));
  console.log(`[storage] restored ${Object.keys(collections).length} collection(s) from backup created ${bundle.createdAt}`);
}

async function ensureFile(name) {
  try {
    await fs.writeFile(fileFor(name), JSON.stringify(COLLECTIONS[name](), null, 2), { flag: 'wx' });
    console.log(`[storage] created ${name}.json`);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err; // existing data is never overwritten
  }
}

/**
 * Loads all collections. `beforeLoad({ dataDir, fileFor, ... })` runs after a staged restore and
 * before missing files are created; it can fill in files from elsewhere (e.g. the GitHub backup).
 */
async function init({ beforeLoad } = {}) {
  if (process.env.DATABASE_URL) {
    db = require('./db/prismaStore');
    try {
      await db.connect();
      await db.loadInto(cache);
    } catch (err) {
      throw new Error(`Could not load data from the database: ${err.message}`);
    }
    dataDir = 'database';
    const schema = /[?&]schema=([^&]+)/.exec(process.env.DATABASE_URL);
    console.log(`[storage] PostgreSQL database (schema "${schema ? decodeURIComponent(schema[1]) : 'public'}")`);
    return;
  }
  db = null;
  dataDir = resolveDataDir();
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (err) {
    throw new Error(
      `Cannot create or access the data directory ${dataDir} (${err.code}). ` +
      `On Render, attach a Persistent Disk with mount path ${dataDir}; otherwise set DATA_DIR to a writable folder.`
    );
  }
  await applyPendingRestore();
  if (beforeLoad) {
    await beforeLoad({ dataDir, names: COLLECTION_NAMES, fileFor, readJson, writeAtomic, hasValidShape });
  }
  for (const name of COLLECTION_NAMES) {
    await ensureFile(name);
    let data;
    try {
      data = await readJson(fileFor(name));
    } catch (err) {
      throw new Error(
        `Could not read ${fileFor(name)}: ${err.message}. The file was left untouched; fix it or restore it from a backup, then restart.`
      );
    }
    if (!hasValidShape(name, data)) {
      throw new Error(`${fileFor(name)} has an unexpected structure. The file was left untouched; restore it from a backup.`);
    }
    cache.set(name, data);
  }
  console.log(`[storage] data directory: ${dataDir}`);
}

function ensureReady() {
  if (!dataDir) throw new Error('Storage has not been initialised. Call storage.init() first.');
}

/** Returns the in-memory data for a collection. Treat it as read-only. */
function get(name) {
  ensureReady();
  assertKnown(name);
  return cache.get(name);
}

function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Runs `fn(drafts)` with exclusive write access to the named collections.
 * `drafts` holds deep copies that `fn` may modify (or replace). If `fn` throws,
 * nothing is written. Otherwise each draft is written atomically and becomes the
 * new in-memory state. Returns whatever `fn` returns.
 */
function transaction(names, fn) {
  ensureReady();
  names.forEach(assertKnown);
  if (db) {
    return enqueue(async () => {
      const result = await db.transaction(names, fn, { cache, hasValidShape });
      localVersion += 1;
      for (const listener of writeListeners) listener(names);
      return result;
    });
  }
  return enqueue(async () => {
    const drafts = {};
    for (const name of names) drafts[name] = structuredClone(cache.get(name));
    const result = await fn(drafts);
    for (const name of names) {
      if (!hasValidShape(name, drafts[name])) throw new Error(`Refusing to write invalid data to ${name}.json`);
    }
    for (const name of names) {
      await writeAtomic(fileFor(name), drafts[name]);
      cache.set(name, drafts[name]);
    }
    localVersion += 1;
    for (const listener of writeListeners) listener(names);
    return result;
  });
}

/** A consistent copy of every collection, taken while no writes are in progress. */
function snapshot() {
  ensureReady();
  return enqueue(async () => {
    if (db) await db.refreshIfStale(cache);
    return {
      format: BACKUP_FORMAT,
      version: 1,
      createdAt: new Date().toISOString(),
      collections: Object.fromEntries(COLLECTION_NAMES.map((name) => [name, cache.get(name)])),
    };
  });
}

/** Database mode: reloads if another server changed the data. JSON file mode: no-op. */
function refresh() {
  if (!db) return Promise.resolve();
  return enqueue(() => db.refreshIfStale(cache));
}

/** Database mode: replaces stored collections with those from a backup bundle. */
function replaceAll(collections) {
  ensureReady();
  if (!db) throw new Error('replaceAll is only available in database mode');
  return enqueue(() => db.replaceAll(collections, { cache, hasValidShape }));
}

const backend = () => (db ? 'postgres' : 'files');

/** A value that changes whenever stored data changes (in database mode, also by other servers). */
const dataVersion = () => (db ? `db-${db.currentVersion()}` : `${bootId}-${localVersion}`);

async function close() {
  if (db) await db.disconnect();
}

/** Registers `listener(names)`, called after collections have been written successfully. */
function onWrite(listener) {
  writeListeners.push(listener);
}

function getConfig() {
  return { ...DEFAULT_CONFIG, ...get('config') };
}

module.exports = {
  init,
  onWrite,
  refresh,
  replaceAll,
  backend,
  dataVersion,
  close,
  get,
  getConfig,
  transaction,
  snapshot,
  resolveDataDir,
  validateBundle,
  readJson,
  COLLECTION_NAMES,
  BACKUP_FORMAT,
  RESTORE_FILE,
};
