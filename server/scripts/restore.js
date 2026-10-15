'use strict';
// Usage: npm run restore -- <backup-file>
// Validates the backup and stages it as DATA_DIR/restore-pending.json. The server applies it
// on its next start (before loading any data), so a running server cannot overwrite it.
const fs = require('fs/promises');
const path = require('path');
const { loadEnv } = require('../lib/env');

loadEnv();
const storage = require('../lib/storage');

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Pass the backup file path, e.g. npm run restore -- backups/feedback-backup.json');
  const bundle = await storage.readJson(path.resolve(source));
  const collections = storage.validateBundle(bundle);
  const dataDir = storage.resolveDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, storage.RESTORE_FILE), JSON.stringify(bundle));
  console.log(`Backup from ${bundle.createdAt} (${Object.keys(collections).join(', ')}) staged in ${dataDir}.`);
  console.log('Restart the server now to apply it. Collections in the backup will replace the current files.');
}

main().catch((err) => {
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
});
