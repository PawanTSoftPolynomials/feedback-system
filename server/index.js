'use strict';
const { loadEnv } = require('./lib/env');

loadEnv();

const storage = require('./lib/storage');
const { ensureAdmin, getSecret } = require('./lib/auth');
const { isEmailConfigured } = require('./lib/mail');
const { createApp } = require('./app');
const githubSync = require('./lib/githubSync');
const { runMigrations } = require('./lib/db/migrate');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries a startup step while the database is unreachable (e.g. slow network or a waking database). */
async function withDatabaseRetry(label, step, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await step();
    } catch (err) {
      const unreachable = /P1001|P1002|P1017|Can't reach database|ECONNRESET|ETIMEDOUT|timed out/i.test(err.message);
      if (!unreachable || attempt >= attempts) throw err;
      const wait = attempt * 5000;
      console.warn(`[db] ${label}: database not reachable (attempt ${attempt}/${attempts}), retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function main() {
  const useDatabase = Boolean(process.env.DATABASE_URL);
  if (useDatabase) await withDatabaseRetry('migrations', runMigrations);
  // The GitHub backup is only needed for JSON files without a persistent disk.
  const sync = useDatabase ? null : githubSync.fromEnv();
  if (useDatabase && process.env.GITHUB_SYNC_REPO) console.log('[sync] DATABASE_URL is set, so the GitHub file backup is not used.');
  await withDatabaseRetry('loading data', () => storage.init({ beforeLoad: sync ? sync.pull : undefined }), useDatabase ? 5 : 1);
  if (sync) {
    sync.start(storage);
    githubSync.activate(sync);
  } else if (!useDatabase && process.env.RENDER && !process.env.DATA_DIR?.startsWith('/')) {
    console.warn('[storage] Running on Render without a persistent disk or GitHub backup: data will be lost on restart, redeploy and sleep.');
  }
  await ensureAdmin();
  getSecret();
  if (!isEmailConfigured()) console.warn('[mail] BREVO_API_KEY / MAIL_FROM not set: winner emails will be recorded as failed until configured.');

  const port = Number(process.env.PORT) || 4000;
  const server = createApp().listen(port, () => console.log(`[server] listening on http://localhost:${port}`));

  // Render stops the service with SIGTERM (redeploy, restart, sleep): finish uploads to the backup first.
  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close();
    if (sync) {
      await Promise.race([sync.flush(), new Promise((resolve) => setTimeout(resolve, 20000))]);
      const { pending } = sync.getStatus();
      console.log(pending ? `[sync] ${pending} file(s) could not be uploaded before shutdown` : '[sync] all changes saved to GitHub');
    }
    await storage.close().catch(() => {});
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(`[server] startup failed: ${err.message}`);
  process.exit(1);
});
