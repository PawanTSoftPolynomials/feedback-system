'use strict';
// Applies pending Prisma migrations (prisma/migrations) to DATABASE_URL. Safe to run on every start:
// already-applied migrations are skipped. Only the schema named in the URL (?schema=feedback) is touched.
const { spawn } = require('child_process');
const path = require('path');
const { PROJECT_ROOT } = require('../env');

function runMigrations() {
  const cli = require.resolve('prisma/build/index.js', { paths: [PROJECT_ROOT] });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy', '--schema', path.join(PROJECT_ROOT, 'prisma', 'schema.prisma')], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        const applied = /have been applied|No pending migrations/i.test(output) ? output.match(/(\d+) migrations? found/)?.[0] : '';
        console.log(`[db] migrations up to date${applied ? ` (${applied})` : ''}`);
        resolve();
      } else {
        reject(new Error(`Database migration failed:\n${output.trim()}`));
      }
    });
  });
}

module.exports = { runMigrations };
