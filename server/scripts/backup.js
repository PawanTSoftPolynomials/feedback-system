'use strict';
// Usage: npm run backup [-- <output-file>]
// Writes all data into one backup file (default: ./backups/). Reads from the PostgreSQL database
// when DATABASE_URL is set, otherwise from the JSON files in DATA_DIR.
const fs = require('fs/promises');
const path = require('path');
const { loadEnv, PROJECT_ROOT } = require('../lib/env');

loadEnv();
const storage = require('../lib/storage');

async function readCollections() {
  if (process.env.DATABASE_URL) {
    const db = require('../lib/db/prismaStore');
    await db.connect();
    try {
      return { source: 'the database', collections: await db.loadAll(db.client()) };
    } finally {
      await db.disconnect();
    }
  }
  const dataDir = storage.resolveDataDir();
  const collections = {};
  for (const name of storage.COLLECTION_NAMES) {
    try {
      collections[name] = await storage.readJson(path.join(dataDir, `${name}.json`));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw new Error(`${name}.json could not be read: ${err.message}`);
    }
  }
  return { source: dataDir, collections };
}

async function main() {
  const createdAt = new Date().toISOString();
  const { source, collections } = await readCollections();
  const out = path.resolve(process.argv[2] || path.join(PROJECT_ROOT, 'backups', `feedback-backup-${createdAt.replace(/[:.]/g, '-')}.json`));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ format: storage.BACKUP_FORMAT, version: 1, createdAt, collections }, null, 2), { flag: 'wx' });
  console.log(`Backup of ${Object.keys(collections).length} collection(s) from ${source} written to:\n  ${out}`);
}

main().catch((err) => {
  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
});
