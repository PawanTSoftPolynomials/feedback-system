'use strict';
// Usage: npm run backup [-- <output-file>]
// Writes every JSON collection from DATA_DIR into one backup file (default: ./backups/).
const fs = require('fs/promises');
const path = require('path');
const { loadEnv, PROJECT_ROOT } = require('../lib/env');

loadEnv();
const storage = require('../lib/storage');

async function main() {
  const dataDir = storage.resolveDataDir();
  const createdAt = new Date().toISOString();
  const collections = {};
  for (const name of storage.COLLECTION_NAMES) {
    try {
      collections[name] = await storage.readJson(path.join(dataDir, `${name}.json`));
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw new Error(`${name}.json could not be read: ${err.message}`);
    }
  }
  const out = path.resolve(process.argv[2] || path.join(PROJECT_ROOT, 'backups', `feedback-backup-${createdAt.replace(/[:.]/g, '-')}.json`));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ format: storage.BACKUP_FORMAT, version: 1, createdAt, collections }, null, 2), { flag: 'wx' });
  console.log(`Backup of ${Object.keys(collections).length} collection(s) from ${dataDir} written to:\n  ${out}`);
}

main().catch((err) => {
  console.error(`Backup failed: ${err.message}`);
  process.exit(1);
});
