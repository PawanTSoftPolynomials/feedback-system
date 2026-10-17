'use strict';
// GitHub backup against a fake GitHub contents API.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const storage = require('../lib/storage');
const { createGitHubSync } = require('../lib/githubSync');

// ---- Fake GitHub: files keyed by path, each with a sha that changes on every write.
const files = new Map();
let down = false;
let slowMs = 0;
let puts = 0;
const sha = (text) => crypto.createHash('sha1').update(text + Math.random()).digest('hex');

const fake = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (down) return send(503, { message: 'Service unavailable' });
  if (req.headers.authorization !== 'Bearer test-token') return send(401, { message: 'Bad credentials' });
  const match = /^\/repos\/owner\/data-repo\/contents\/(.+?)(\?.*)?$/.exec(req.url);
  if (!match) return send(404, { message: 'Not Found' });
  const key = decodeURIComponent(match[1]);
  if (req.method === 'GET') {
    const file = files.get(key);
    if (!file) return send(404, { message: 'Not Found' });
    return send(200, { sha: file.sha, encoding: 'base64', content: Buffer.from(file.text).toString('base64') });
  }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => setTimeout(() => {
    const body = JSON.parse(raw);
    const existing = files.get(key);
    if (existing && body.sha !== existing.sha) return send(409, { message: 'sha does not match' });
    if (!existing && body.sha) return send(422, { message: 'sha given for a new file' });
    puts += 1;
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    const file = { sha: sha(text), text };
    files.set(key, file);
    return send(existing ? 200 : 201, { content: { sha: file.sha } });
  }, slowMs));
});

let apiUrl;
const tmpDirs = [];
function freshDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-sync-'));
  tmpDirs.push(dir);
  process.env.DATA_DIR = dir;
  return dir;
}
// Each test stops its instance, as a restarted server would no longer be running the old one.
const instances = [];
const newSync = () => {
  instances.forEach((s) => s.stop());
  const sync = createGitHubSync({ repo: 'owner/data-repo', token: 'test-token', branch: null, folder: 'data', apiUrl, debounceMs: 5, retryMs: 50 });
  instances.push(sync);
  return sync;
};
const remoteJson = (name) => JSON.parse(files.get(`data/${name}.json`).text);

before(async () => {
  await new Promise((resolve) => fake.listen(0, resolve));
  apiUrl = `http://127.0.0.1:${fake.address().port}`;
});

after(() => {
  instances.forEach((s) => s.stop());
  fake.closeAllConnections();
  fake.close();
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('startup stops (and creates nothing) when GitHub is unreachable', async () => {
  const dir = freshDataDir();
  down = true;
  await assert.rejects(storage.init({ beforeLoad: newSync().pull }), /Startup stopped so that no data is overwritten/);
  down = false;
  assert.ok(!fs.existsSync(path.join(dir, 'questions.json')), 'no empty file may be created');
});

test('a wiped instance restores its data from GitHub and uploads missing files', async () => {
  files.set('data/questions.json', { sha: 'q1', text: JSON.stringify([{ id: 'q-1', text: 'Saved question', type: 'yes_no', options: [], required: true, active: true, order: 0 }]) });
  freshDataDir();
  const sync = newSync();
  await storage.init({ beforeLoad: sync.pull });
  sync.start(storage);
  assert.equal(storage.get('questions')[0].text, 'Saved question');
  await sync.flush();
  for (const name of storage.COLLECTION_NAMES) assert.ok(files.has(`data/${name}.json`), `${name}.json uploaded`);
  assert.equal(sync.getStatus().pending, 0);
});

test('every change is uploaded, and survives the next wipe', async () => {
  let sync = newSync();
  freshDataDir();
  await storage.init({ beforeLoad: sync.pull });
  sync.start(storage);
  await storage.transaction(['submissions'], (d) => {
    d.submissions.push({ id: 's-1', studentId: 'p-1', role: 'teacher', answers: [{ questionId: 'q-1', answer: 'yes' }], ratings: [], comment: 'Kept', submittedAt: new Date().toISOString() });
  });
  await sync.flush();
  assert.equal(remoteJson('submissions')[0].comment, 'Kept');

  // Simulate Render wiping the disk and starting again.
  freshDataDir();
  sync = newSync();
  await storage.init({ beforeLoad: sync.pull });
  sync.start(storage);
  assert.equal(storage.get('submissions')[0].answers[0].answer, 'yes');
  assert.equal(storage.get('questions')[0].text, 'Saved question');

  // Unchanged files are not uploaded again.
  const before = puts;
  await sync.flush();
  assert.equal(puts, before);
});

test('an upload still succeeds when the file changed on GitHub', async () => {
  const sync = newSync();
  freshDataDir();
  await storage.init({ beforeLoad: sync.pull });
  sync.start(storage);
  files.get('data/questions.json').sha = 'changed-elsewhere';
  await storage.transaction(['questions'], (d) => {
    d.questions.push({ id: 'q-2', text: 'Second question', type: 'yes_no', options: [], required: false, active: true, order: 1 });
  });
  await sync.flush();
  assert.equal(remoteJson('questions').length, 2);
  assert.equal(sync.getStatus().lastError, null);
});

test('files still uploading count as pending until GitHub has them', async () => {
  const sync = newSync();
  freshDataDir();
  await storage.init({ beforeLoad: sync.pull });
  sync.start(storage);
  await storage.transaction(['questions'], (d) => {
    d.questions.push({ id: 'q-3', text: 'Third question', type: 'yes_no', options: [], required: false, active: true, order: 2 });
  });
  slowMs = 150;
  const done = sync.flush();
  await new Promise((resolve) => setTimeout(resolve, 60)); // upload is in progress
  assert.equal(sync.getStatus().pending, 1, 'an in-flight upload must still be reported as pending');
  await done;
  slowMs = 0;
  assert.equal(sync.getStatus().pending, 0);
  assert.equal(remoteJson('questions').length, 3);
});
