'use strict';
// Runs the full API test suite against PostgreSQL, in a temporary schema that is dropped afterwards.
// Uses TEST_DATABASE_URL, or DATABASE_URL from .env. Other schemas (e.g. "public", "feedback") are not touched.
const { spawnSync } = require('child_process');
const path = require('path');
const { loadEnv, PROJECT_ROOT } = require('../lib/env');

loadEnv();
const base = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!base) {
  console.log('No TEST_DATABASE_URL or DATABASE_URL set: database tests skipped.');
  process.exit(0);
}
const schema = `feedback_test_${Date.now()}`;
const url = new URL(base);
url.searchParams.set('schema', schema);
url.searchParams.set('connection_limit', '3');
const env = { ...process.env, DATABASE_URL: url.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' };

async function dropSchema() {
  if (!/^feedback_test_\d+$/.test(schema)) throw new Error('refusing to drop unexpected schema');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await prisma.$disconnect();
}

(async () => {
  let status = 1;
  try {
    const cli = require.resolve('prisma/build/index.js', { paths: [PROJECT_ROOT] });
    const migrate = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { cwd: PROJECT_ROOT, env, encoding: 'utf8' });
    if (migrate.status !== 0) throw new Error(`migration failed:\n${migrate.stdout}${migrate.stderr}`);
    console.log(`Running API tests against PostgreSQL schema "${schema}"…`);
    const run = spawnSync(process.execPath, ['--test', '--test-timeout=120000', path.join(__dirname, 'api.test.js')], { cwd: PROJECT_ROOT, env, stdio: 'inherit' });
    status = run.status;
  } catch (err) {
    console.error(err.message);
  } finally {
    await dropSchema().then(() => console.log(`Dropped test schema "${schema}".`), (err) => console.error(`Could not drop schema ${schema}: ${err.message}`));
  }
  process.exit(status);
})();
