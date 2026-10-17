'use strict';
// End-to-end API test against a temporary data directory. Brevo is stubbed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-test-'));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.PUBLIC_BASE_URL = 'http://example.test';

const storage = require('../lib/storage');
const mail = require('../lib/mail');
const { ensureAdmin } = require('../lib/auth');
const { createApp } = require('../app');

// Set by server/test/run-db-tests.js to run this whole suite against PostgreSQL.
const USE_DB = Boolean(process.env.DATABASE_URL);
const db = USE_DB ? require('../lib/db/prismaStore') : null;
/** Reads what is actually persisted: the JSON file, or the database tables. */
async function stored(name) {
  if (USE_DB) return (await db.loadAll(db.client()))[name];
  return JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'));
}

const sentEmails = [];
let failEmail = false;
mail.sendEmail = async (to, subject, html) => {
  if (failEmail) throw new Error('Brevo could not accept the email: test failure');
  sentEmails.push({ to, subject, html });
  return { messageId: 'test-id' };
};

let server;
let base;
let adminToken;

async function call(method, url, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + url, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const student = (n) => ({ fullName: `Student ${n}`, mobile: `98765${String(n).padStart(5, '0')}`, email: `s${n}@example.com`, college: 'Test College' });

before(async () => {
  await storage.init();
  await ensureAdmin();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let questionId;
let attributeId;

test('creates storage and hashes the admin password', async () => {
  if (!USE_DB) for (const name of storage.COLLECTION_NAMES) assert.ok(fs.existsSync(path.join(dataDir, `${name}.json`)), name);
  const admin = await stored('admin');
  assert.ok(admin.passwordHash.startsWith('$2'));
  assert.ok(!JSON.stringify(admin).includes('test-password-123'));
});

test('admin login and protected routes', async () => {
  assert.equal((await call('GET', '/admin/questions')).status, 401);
  assert.equal((await call('POST', '/admin/login', { username: 'admin', password: 'wrong' })).status, 401);
  const res = await call('POST', '/admin/login', { username: 'admin', password: 'test-password-123' });
  assert.equal(res.status, 200);
  adminToken = res.body.token;
});

test('admin manages questions and attributes', async () => {
  const q1 = await call('POST', '/admin/questions', { text: 'Which module did you like?', type: 'single_choice', options: ['A', 'B'], required: true }, adminToken);
  assert.equal(q1.status, 201);
  questionId = q1.body.id;
  const q2 = await call('POST', '/admin/questions', { text: 'Anything else?', type: 'short_text' }, adminToken);
  assert.equal((await call('POST', '/admin/questions', { text: 'Bad', type: 'single_choice', options: ['only one'] }, adminToken)).status, 400);
  const reordered = await call('PUT', '/admin/questions/reorder', { ids: [q2.body.id, questionId] }, adminToken);
  assert.deepEqual(reordered.body.map((q) => q.id), [q2.body.id, questionId]);
  const a = await call('POST', '/admin/attributes', { name: 'Content Quality', scale: 5, required: true }, adminToken);
  attributeId = a.body.id;
  const form = await call('GET', '/form');
  assert.equal(form.body.questions.length, 2);
  assert.equal(form.body.attributes.length, 1);
});

test('student submission validation, success and duplicate prevention', async () => {
  const missing = await call('POST', '/submissions', { student: student(1), answers: {}, ratings: { [attributeId]: 4 } });
  assert.equal(missing.status, 400);
  const ok = await call('POST', '/submissions', { student: student(1), answers: { [questionId]: 'A' }, ratings: { [attributeId]: 4 }, comment: 'Great!' });
  assert.equal(ok.status, 201);
  const dupEmail = await call('POST', '/submissions', { student: { ...student(2), email: 'S1@example.com' }, answers: { [questionId]: 'B' }, ratings: { [attributeId]: 3 } });
  assert.equal(dupEmail.status, 409);
  const dupMobile = await call('POST', '/submissions', { student: { ...student(3), mobile: `+91 ${student(1).mobile}` }, answers: { [questionId]: 'B' }, ratings: { [attributeId]: 3 } });
  assert.equal(dupMobile.status, 409);
});

test('concurrent submissions are all saved without lost updates', async () => {
  const results = await Promise.all(
    Array.from({ length: 25 }, (_, i) => call('POST', '/submissions', { student: student(100 + i), answers: { [questionId]: 'B' }, ratings: { [attributeId]: 5 } }))
  );
  assert.ok(results.every((r) => r.status === 201));
  // Same student submitting twice at the same time: exactly one succeeds.
  const race = await Promise.all([1, 2].map(() => call('POST', '/submissions', { student: student(500), answers: { [questionId]: 'A' }, ratings: { [attributeId]: 2 } })));
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const onDisk = (await stored('submissions'));
  assert.equal(onDisk.length, 27);
  const list = await call('GET', '/admin/submissions?page=1&limit=10&search=student 1', null, adminToken);
  assert.ok(list.body.total >= 1);
  const summary = await call('GET', '/admin/summary', undefined, adminToken);
  assert.equal(summary.body.totalSubmissions, 27);
});

test('winner flow: email, portal verification, one selection only', async () => {
  const prize1 = await call('POST', '/admin/prizes', { name: 'Movie Ticket', type: 'Voucher' }, adminToken);
  const prize2 = await call('POST', '/admin/prizes', { name: 'Gift Voucher', type: 'Voucher' }, adminToken);
  const inactive = await call('POST', '/admin/prizes', { name: 'Hidden', active: false }, adminToken);

  const subs = await call('GET', '/admin/submissions?limit=100', undefined, adminToken);
  const submissionId = subs.body.items[0].id;

  // Failed email is recorded as failed, never as sent.
  failEmail = true;
  const failed = await call('POST', '/admin/winners', { submissionId }, adminToken);
  assert.equal(failed.status, 201);
  assert.equal(failed.body.emailStatus, 'failed');
  assert.match(failed.body.emailError, /test failure/);
  assert.equal((await call('POST', '/admin/winners', { submissionId }, adminToken)).status, 409);

  failEmail = false;
  const resent = await call('POST', `/admin/winners/${failed.body.id}/resend`, undefined, adminToken);
  assert.equal(resent.body.emailStatus, 'sent');
  const token = sentEmails.at(-1).html.match(/\/prize\/([\w-]+)/)[1];
  assert.ok(!JSON.stringify(await stored('winners')).includes(token), 'raw token must not be stored');

  assert.equal((await call('POST', '/portal/session', { token: 'x'.repeat(43) })).status, 404);
  const session = await call('POST', '/portal/session', { token });
  assert.equal(session.status, 200);
  assert.equal(session.body.canSelect, true);
  assert.deepEqual(session.body.prizes.map((p) => p.name), ['Movie Ticket', 'Gift Voucher']);
  assert.ok(!('email' in session.body));

  assert.equal((await call('POST', '/portal/select', { token, prizeId: inactive.body.id })).status, 400);
  const both = await Promise.all([prize1, prize2].map((p) => call('POST', '/portal/select', { token, prizeId: p.body.id })));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call('POST', '/portal/select', { token, prizeId: prize1.body.id })).status, 409);

  // Admin explicitly permits one change.
  await call('PUT', `/admin/winners/${failed.body.id}/allow-change`, { allowChange: true }, adminToken);
  const changed = await call('POST', '/portal/select', { token, prizeId: prize2.body.id });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.selection.prizeName, 'Gift Voucher');
  assert.equal(changed.body.canSelect, false);

  const winners = await call('GET', '/admin/winners', undefined, adminToken);
  assert.equal(winners.body[0].selection.prizeName, 'Gift Voucher');
  assert.ok(winners.body[0].selection.selectedAt);
  assert.equal((await call('DELETE', `/admin/prizes/${prize2.body.id}`, undefined, adminToken)).status, 409);
});

test('data directory is not served', async () => {
  const res = await fetch(base.replace('/api', '') + '/data/admin.json');
  assert.notEqual(res.headers.get('content-type') || '', 'application/json');
});

test('bulk delete removes feedback; winners keep their own stored copy', async () => {
  assert.equal((await call('POST', '/admin/submissions/delete', { ids: [] })).status, 401);
  assert.equal((await call('POST', '/admin/submissions/delete', { ids: [] }, adminToken)).status, 400);

  const before = await call('GET', '/admin/summary', undefined, adminToken);
  const winner = (await call('GET', '/admin/winners', undefined, adminToken)).body[0];
  const ids = (await call('GET', '/admin/submissions/ids?search=student 10', undefined, adminToken)).body.ids;
  assert.ok(ids.length > 0);

  const res = await call('POST', '/admin/submissions/delete', { ids: [...ids, winner.submissionId, 'missing-id'] }, adminToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { deleted: ids.length + 1, winnersKept: 1, notFound: 1 });

  const after = await call('GET', '/admin/summary', undefined, adminToken);
  assert.equal(after.body.totalSubmissions, before.body.totalSubmissions - ids.length - 1);
  assert.equal(after.body.totalWinners, before.body.totalWinners);
  const students = (await stored('students'));
  const submissions = (await stored('submissions'));
  assert.equal(students.length, submissions.length);

  // The winner's separate record still has the student's details and feedback.
  const detail = await call('GET', `/admin/winners/${winner.id}`, undefined, adminToken);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.submissionExists, false);
  assert.equal(detail.body.student.email, winner.student.email);
  assert.ok(detail.body.feedback.ratings.length > 0);
  assert.equal(detail.body.selection.prizeName, 'Gift Voucher');

  // A deleted student can submit again.
  const again = await call('POST', '/submissions', { student: student(100), answers: { [questionId]: 'A' }, ratings: { [attributeId]: 4 } });
  assert.equal(again.status, 201);
});

test('winners page: declared winners are stored separately and can be deleted', async () => {
  const subs = (await call('GET', '/admin/submissions?filter=non-winners&limit=100', undefined, adminToken)).body.items;
  const declared = [];
  for (const sub of subs.slice(0, 2)) declared.push((await call('POST', '/admin/winners', { submissionId: sub.id }, adminToken)).body);
  const savedWinners = await stored('winners');
  for (const w of declared) {
    const rec = savedWinners.find((x) => x.id === w.id);
    assert.equal(rec.student.email, subs.find((s) => s.id === w.submissionId).student.email);
    assert.ok(Array.isArray(rec.feedback.answers));
  }

  // Deleting a winner with a prize also removes the selection and invalidates the link.
  const token = sentEmails.at(-1).html.match(/\/prize\/([\w-]+)/)[1];
  const prizes = (await call('GET', '/admin/prizes', undefined, adminToken)).body.filter((p) => p.active);
  assert.equal((await call('POST', '/portal/select', { token, prizeId: prizes[0].id })).status, 200);
  assert.equal((await call('POST', '/admin/winners/delete', { ids: [] }, adminToken)).status, 400);
  const del = await call('POST', '/admin/winners/delete', { ids: declared.map((w) => w.id) }, adminToken);
  assert.deepEqual(del.body, { deleted: 2, selectionsDeleted: 1, notFound: 0 });
  assert.equal((await call('POST', '/portal/session', { token })).status, 404);
  const remaining = (await call('GET', '/admin/winners', undefined, adminToken)).body;
  assert.ok(remaining.every((w) => !declared.some((d) => d.id === w.id)));
  assert.ok(!(await stored('selections')).some((s) => declared.some((d) => d.id === s.winnerId)));

  // Single delete of the remaining winner (who also has a prize selected).
  assert.equal((await call('DELETE', `/admin/winners/${remaining[0].id}`, undefined, adminToken)).status, 204);
  assert.equal((await call('GET', `/admin/winners/${remaining[0].id}`, undefined, adminToken)).status, 404);
});

test('bulk JSON import of questions', async () => {
  const before = (await call('GET', '/admin/questions', undefined, adminToken)).body.length;
  assert.equal((await call('POST', '/admin/questions/import', [{ text: 'X', type: 'short_text' }])).status, 401);
  assert.equal((await call('POST', '/admin/questions/import', { nope: true }, adminToken)).status, 400);

  // One invalid question rejects the whole import, naming the question.
  const bad = await call('POST', '/admin/questions/import', [
    { text: 'Fine question', type: 'short_text' },
    { text: 'Broken', type: 'single_choice', options: ['only one'] },
  ], adminToken);
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /^Question 2:/);
  assert.equal((await call('GET', '/admin/questions', undefined, adminToken)).body.length, before);

  const list = [
    { text: 'Which course did you attend?', type: 'short_text', required: true },
    { text: 'What did you like most?', type: 'long_text' },
    { text: 'How did you hear about us?', type: 'single_choice', options: ['Friend', 'Social media'], required: true },
    { text: 'Which topics were useful?', type: 'multiple_choice', options: ['HTML', 'React', 'Node'] },
    { text: 'Would you recommend us?', type: 'yes_no', required: true },
    { text: 'what did you like MOST?', type: 'long_text' }, // duplicate (case-insensitive)
  ];
  const ok = await call('POST', '/admin/questions/import', { questions: list }, adminToken);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.imported, 5);
  assert.equal(ok.body.skipped, 1);
  assert.deepEqual(ok.body.questions.slice(-5).map((q) => q.type), ['short_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no']);

  // Importing the same file again adds nothing.
  const again = await call('POST', '/admin/questions/import', list, adminToken);
  assert.deepEqual([again.body.imported, again.body.skipped], [0, 6]);
});

test('questions and ratings are split into LMS and Course sections', async () => {
  const q = await call('POST', '/admin/questions', { text: 'Was the trainer clear?', type: 'yes_no', category: 'course', required: true }, adminToken);
  assert.equal(q.body.category, 'course');
  assert.equal((await call('POST', '/admin/questions', { text: 'Bad', type: 'yes_no', category: 'other' }, adminToken)).status, 400);
  const noCategory = await call('POST', '/admin/questions', { text: 'Is the LMS fast?', type: 'yes_no' }, adminToken);
  assert.equal(noCategory.body.category, 'lms');

  const a = await call('POST', '/admin/attributes', { name: 'Trainer Knowledge', category: 'Course', scale: 5 }, adminToken);
  assert.equal(a.body.category, 'course');

  // Import: the list-level category is the default; per-question category wins.
  // The same text may exist once per section.
  const imp = await call('POST', '/admin/questions/import', {
    category: 'course',
    questions: [
      { text: 'Is the LMS fast?', type: 'yes_no' },
      { text: 'Is the LMS fast?', type: 'yes_no', category: 'lms' },
    ],
  }, adminToken);
  assert.deepEqual([imp.body.imported, imp.body.skipped], [1, 1]);
  assert.ok(imp.body.questions.some((x) => x.text === 'Is the LMS fast?' && x.category === 'course'));

  const form = await call('GET', '/form');
  assert.ok(form.body.questions.every((x) => ['lms', 'course'].includes(x.category)));
  assert.equal(form.body.attributes.find((x) => x.id === a.body.id).category, 'course');

  // Submissions keep the section of every answer and rating.
  const answers = Object.fromEntries(form.body.questions.filter((x) => x.required).map((x) => [x.id, x.type === 'yes_no' ? 'yes' : x.type.endsWith('choice') ? x.options[0] : 'ok']));
  const ratings = Object.fromEntries(form.body.attributes.map((x) => [x.id, 3]));
  assert.equal((await call('POST', '/submissions', { student: student(900), answers, ratings })).status, 201);
  const saved = (await stored('submissions')).at(-1);
  assert.equal(saved.answers.find((x) => x.questionId === q.body.id).category, 'course');
  assert.equal(saved.ratings.find((x) => x.attributeId === a.body.id).category, 'course');
  const summary = await call('GET', '/admin/summary', undefined, adminToken);
  assert.equal(summary.body.attributes.find((x) => x.attributeId === a.body.id).category, 'course');
});

test('teachers get their own questions, ratings and submissions', async () => {
  const tq = await call('POST', '/admin/questions', { text: 'Is the LMS useful for teaching?', type: 'yes_no', role: 'teacher', required: true }, adminToken);
  assert.equal(tq.body.role, 'teacher');
  assert.equal((await call('POST', '/admin/questions', { text: 'x', type: 'yes_no', role: 'parent' }, adminToken)).status, 400);
  const ta = await call('POST', '/admin/attributes', { name: 'Course Material for Teaching', role: 'teacher', category: 'course' }, adminToken);
  assert.equal(ta.body.role, 'teacher');

  // Import with a list-level role; the same text can exist once per role.
  const imp = await call('POST', '/admin/questions/import', { role: 'teacher', questions: [{ text: 'Was the trainer clear?', type: 'yes_no', category: 'course' }] }, adminToken);
  assert.equal(imp.body.imported, 1);
  assert.equal(imp.body.questions.filter((q) => q.text === 'Was the trainer clear?').map((q) => q.role).sort().join(), 'student,teacher');

  const form = (await call('GET', '/form')).body;
  assert.ok(form.questions.some((q) => q.role === 'teacher') && form.questions.some((q) => q.role === 'student'));

  // A teacher submission only validates teacher questions/ratings (student ones are not required).
  const teacher = { fullName: 'Teacher One', mobile: '9123456780', email: 'teacher1@example.com', college: 'Test College' };
  const missing = await call('POST', '/submissions', { role: 'teacher', student: teacher, answers: {}, ratings: { [ta.body.id]: 4 } });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /useful for teaching/);
  const ok = await call('POST', '/submissions', { role: 'teacher', student: teacher, answers: { [tq.body.id]: 'yes' }, ratings: { [ta.body.id]: 4 } });
  assert.equal(ok.status, 201);
  assert.equal((await call('POST', '/submissions', { role: 'teacher', student: teacher, answers: { [tq.body.id]: 'no' }, ratings: { [ta.body.id]: 2 } })).status, 409);

  const saved = (await stored('submissions')).at(-1);
  assert.equal(saved.role, 'teacher');
  assert.ok(saved.answers.every((a) => form.questions.find((q) => q.id === a.questionId).role === 'teacher'));

  const list = await call('GET', '/admin/submissions?role=teacher', undefined, adminToken);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].role, 'teacher');
  const summary = (await call('GET', '/admin/summary', undefined, adminToken)).body;
  assert.equal(summary.byRole.teacher, 1);
  assert.equal(summary.attributes.find((a) => a.attributeId === ta.body.id).role, 'teacher');

  // Declared teacher winners keep their role.
  const w = await call('POST', '/admin/winners', { submissionId: list.body.items[0].id }, adminToken);
  assert.equal(w.body.student.role, 'teacher');
});

test('database mode: everything reloaded from PostgreSQL matches what the app holds', { skip: !USE_DB }, async () => {
  const persisted = await db.loadAll(db.client());
  const plain = (v) => JSON.parse(JSON.stringify(v));
  for (const name of storage.COLLECTION_NAMES) {
    const inDb = plain(persisted[name]);
    const inApp = plain(storage.get(name));
    if (!Array.isArray(inApp)) {
      assert.deepEqual(inDb, inApp, name);
      continue;
    }
    // Row order may differ (the app always sorts for display); every row must match field by field.
    assert.equal(inDb.length, inApp.length, `${name}: row count`);
    const byId = new Map(inDb.map((row) => [row.id, row]));
    for (const item of inApp) {
      const row = byId.get(item.id);
      assert.ok(row, `${name}: ${item.id} missing in database`);
      for (const key of new Set([...Object.keys(item), ...Object.keys(row)])) {
        assert.deepEqual(row[key] ?? null, item[key] ?? null, `${name}.${key} of ${item.id}`);
      }
    }
  }
});

test('database mode: changes made by another server are picked up on the next request', { skip: !USE_DB }, async () => {
  const other = db.client(); // stands in for a second server sharing the database
  const now = new Date();
  await other.question.create({ data: { id: 'from-other-server', text: 'Added by another server', type: 'yes_no', category: 'course', role: 'teacher', createdAt: now, updatedAt: now, order: 999 } });
  await other.storageMeta.update({ where: { id: 1 }, data: { version: { increment: 1 } } });
  const form = (await call('GET', '/form')).body;
  assert.ok(form.questions.some((q) => q.id === 'from-other-server'));
  // A write after that starts from the other server's data instead of overwriting it.
  const created = await call('POST', '/admin/questions', { text: 'Written after the other server', type: 'yes_no' }, adminToken);
  assert.equal(created.status, 201);
  const ids = (await stored('questions')).map((q) => q.id);
  assert.ok(ids.includes('from-other-server') && ids.includes(created.body.id));
});

test('live endpoint: version changes on every save and stays the same otherwise', async () => {
  const first = (await call('GET', '/live')).body;
  assert.ok(first.version && first.build);
  assert.equal((await call('GET', '/live')).body.version, first.version, 'no change without a save');
  await call('POST', '/admin/prizes', { name: `Live check ${Date.now()}` }, adminToken);
  const after = (await call('GET', '/live')).body;
  assert.notEqual(after.version, first.version);
  assert.equal(after.build, first.build);
});
