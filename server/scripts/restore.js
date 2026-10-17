'use strict';
// Usage: npm run restore -- <backup-file> [--yes]
//
// Database mode (DATABASE_URL set): replaces the data in the database with the backup immediately,
// in one transaction. Requires --yes. Running servers pick up the restored data automatically.
// This also imports a JSON-file backup into the database.
//
// JSON file mode: validates the backup and stages it as DATA_DIR/restore-pending.json. The server
// applies it on its next start (before loading any data), so a running server cannot overwrite it.
const fs = require('fs/promises');
const path = require('path');
const { loadEnv } = require('../lib/env');

loadEnv();
const storage = require('../lib/storage');

async function main() {
  const args = process.argv.slice(2);
  const source = args.find((a) => !a.startsWith('--'));
  if (!source) throw new Error('Pass the backup file path, e.g. npm run restore -- backups/feedback-backup.json');
  const bundle = await storage.readJson(path.resolve(source));
  const collections = storage.validateBundle(bundle);
  const names = Object.keys(collections).join(', ');

  if (process.env.DATABASE_URL) {
    if (!args.includes('--yes')) {
      console.log(`This replaces ${names} in the database with the backup from ${bundle.createdAt}.`);
      console.log('Run again with --yes to continue:  npm run restore -- <file> --yes');
      process.exit(1);
    }
    const { runMigrations } = require('../lib/db/migrate');
    await runMigrations();
    await storage.init();
    await storage.replaceAll(collections);
    await storage.close();
    console.log(`Restored ${names} from the backup of ${bundle.createdAt} into the database.`);
    return;
  }

  const dataDir = storage.resolveDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, storage.RESTORE_FILE), JSON.stringify(bundle));
  console.log(`Backup from ${bundle.createdAt} (${names}) staged in ${dataDir}.`);
  console.log('Restart the server now to apply it. Collections in the backup will replace the current files.');
}

main().catch((err) => {
  console.error(`Restore failed: ${err.message}`);
  process.exit(1);
});
