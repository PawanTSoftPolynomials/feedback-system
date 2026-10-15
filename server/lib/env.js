'use strict';
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Loads ./.env for local development. On Render, variables come from the dashboard.
function loadEnv() {
  try {
    process.loadEnvFile(path.join(PROJECT_ROOT, '.env'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[env] Could not load .env: ${err.message}`);
  }
}

module.exports = { loadEnv, PROJECT_ROOT };
