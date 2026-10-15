'use strict';
const { loadEnv } = require('./lib/env');

loadEnv();

const storage = require('./lib/storage');
const { ensureAdmin, getSecret } = require('./lib/auth');
const { isEmailConfigured } = require('./lib/mail');
const { createApp } = require('./app');

async function main() {
  await storage.init();
  await ensureAdmin();
  getSecret();
  if (!isEmailConfigured()) console.warn('[mail] BREVO_API_KEY / MAIL_FROM not set: winner emails will be recorded as failed until configured.');

  const port = Number(process.env.PORT) || 4000;
  createApp().listen(port, () => console.log(`[server] listening on http://localhost:${port}`));
}

main().catch((err) => {
  console.error(`[server] startup failed: ${err.message}`);
  process.exit(1);
});
