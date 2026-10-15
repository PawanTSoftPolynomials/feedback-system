'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const storage = require('../lib/storage');
const { HttpError } = require('../lib/http');
const { login, requireAdmin } = require('../lib/auth');
const { sortedList, sanitizeQuestion, sanitizeAttribute, sanitizePrize, studentSnapshot, feedbackSnapshot } = require('../lib/content');
const { cleanString, cleanBool, cleanId, cleanInt } = require('../lib/validate');
const winnersRouter = require('./winners');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  res.json(await login(username, password));
});

// Everything below requires a valid admin session.
router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ username: req.admin.username }));

// ---------- Form settings ----------
router.get('/config', (req, res) => res.json(storage.getConfig()));

router.put('/config', async (req, res) => {
  const body = req.body || {};
  const update = {
    formTitle: cleanString(body.formTitle, 'Form title', { required: true, max: 120 }),
    formDescription: cleanString(body.formDescription, 'Form description', { max: 1000, multiline: true }),
    formOpen: cleanBool(body.formOpen, true),
  };
  await storage.transaction(['config'], (d) => {
    Object.assign(d.config, update);
  });
  res.json(storage.getConfig());
});

// ---------- Ordered resources: questions, rating attributes, prizes ----------
function orderedResource(name, sanitize, { notFound, beforeDelete, decorate = (item) => item } = {}) {
  const list = () => sortedList(name).map(decorate);

  router.get(`/${name}`, (req, res) => res.json(list()));

  router.post(`/${name}`, async (req, res) => {
    const data = sanitize(req.body || {});
    const created = await storage.transaction([name], (d) => {
      const now = new Date().toISOString();
      const order = d[name].reduce((max, item) => Math.max(max, item.order), -1) + 1;
      const item = { id: crypto.randomUUID(), ...data, order, createdAt: now, updatedAt: now };
      d[name].push(item);
      return item;
    });
    res.status(201).json(decorate(created));
  });

  router.put(`/${name}/reorder`, async (req, res) => {
    const ids = (req.body || {}).ids;
    if (!Array.isArray(ids)) throw new HttpError(400, 'Expected a list of ids.');
    await storage.transaction([name], (d) => {
      const items = d[name];
      const valid = ids.length === items.length && new Set(ids).size === ids.length && items.every((i) => ids.includes(i.id));
      if (!valid) throw new HttpError(409, 'The list has changed. Please reload the page and try again.');
      for (const item of items) item.order = ids.indexOf(item.id);
    });
    res.json(list());
  });

  router.put(`/${name}/:id`, async (req, res) => {
    const id = cleanId(req.params.id);
    const data = sanitize(req.body || {});
    const updated = await storage.transaction([name], (d) => {
      const item = d[name].find((i) => i.id === id);
      if (!item) throw new HttpError(404, notFound);
      Object.assign(item, data, { updatedAt: new Date().toISOString() });
      return item;
    });
    res.json(decorate(updated));
  });

  router.delete(`/${name}/:id`, async (req, res) => {
    const id = cleanId(req.params.id);
    await storage.transaction([name], (d) => {
      if (!d[name].some((i) => i.id === id)) throw new HttpError(404, notFound);
      if (beforeDelete) beforeDelete(id);
      d[name] = d[name].filter((i) => i.id !== id);
    });
    res.status(204).end();
  });
}

// Submissions keep a copy of each question/attribute text, so deleting one never breaks old feedback.
orderedResource('questions', sanitizeQuestion, { notFound: 'Question not found.' });
orderedResource('attributes', sanitizeAttribute, { notFound: 'Rating attribute not found.' });

// Bulk import: accepts a JSON array of questions (or { "questions": [...] }). Every question is
// validated before anything is saved. Questions whose text already exists are skipped.
router.post('/questions/import', async (req, res) => {
  const body = req.body;
  const list = Array.isArray(body) ? body : body && Array.isArray(body.questions) ? body.questions : null;
  if (!list) throw new HttpError(400, 'Send a JSON array of questions, or an object with a "questions" array.');
  if (list.length === 0) throw new HttpError(400, 'The list of questions is empty.');
  if (list.length > 200) throw new HttpError(400, 'You can import at most 200 questions at a time.');

  const cleaned = list.map((q, i) => {
    if (!q || typeof q !== 'object' || Array.isArray(q)) throw new HttpError(400, `Question ${i + 1}: must be an object like {"text": "...", "type": "short_text"}.`);
    try {
      return sanitizeQuestion(q);
    } catch (err) {
      if (err instanceof HttpError) throw new HttpError(400, `Question ${i + 1}: ${err.message}`);
      throw err;
    }
  });

  const result = await storage.transaction(['questions'], (d) => {
    const existing = new Set(d.questions.map((q) => q.text.toLowerCase()));
    let order = d.questions.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;
    for (const data of cleaned) {
      const key = data.text.toLowerCase();
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      existing.add(key);
      d.questions.push({ id: crypto.randomUUID(), ...data, order: order++, createdAt: now, updatedAt: now });
      imported += 1;
    }
    return { imported, skipped };
  });
  res.status(201).json({ ...result, questions: sortedList('questions') });
});
orderedResource('prizes', sanitizePrize, {
  notFound: 'Prize not found.',
  beforeDelete: (id) => {
    if (storage.get('selections').some((s) => s.prizeId === id)) {
      throw new HttpError(409, 'This prize has already been selected by a winner. Deactivate it instead of deleting it.');
    }
  },
  decorate: (prize) => ({ ...prize, selectedCount: storage.get('selections').filter((s) => s.prizeId === prize.id).length }),
});

// ---------- Feedback dashboard ----------
function average(ratings) {
  const values = ratings.filter((r) => r.value !== null).map((r) => r.value / r.scale);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 10; // percent, 1 decimal
}

function studentSummary(s) {
  return s ? { fullName: s.fullName, email: s.email, mobile: s.mobile, college: s.college } : null;
}

/** Submissions matching the dashboard's search and filter, newest first. */
function matchingSubmissions(query) {
  const search = typeof query.search === 'string' ? query.search.trim().toLowerCase().slice(0, 100) : '';
  const filter = ['winners', 'non-winners'].includes(query.filter) ? query.filter : 'all';

  const students = new Map(storage.get('students').map((s) => [s.id, s]));
  const winnerSubmissions = new Set(storage.get('winners').map((w) => w.submissionId));

  let rows = storage.get('submissions').slice().reverse();
  if (filter === 'winners') rows = rows.filter((r) => winnerSubmissions.has(r.id));
  if (filter === 'non-winners') rows = rows.filter((r) => !winnerSubmissions.has(r.id));
  if (search) {
    rows = rows.filter((r) => {
      const s = students.get(r.studentId);
      return s && [s.fullName, s.email, s.mobile, s.college].some((v) => v.toLowerCase().includes(search));
    });
  }
  return { rows, students, winnerSubmissions };
}

router.get('/submissions', (req, res) => {
  const page = cleanInt(req.query.page, 'page', { min: 1, max: 100000, fallback: 1 });
  const limit = cleanInt(req.query.limit, 'limit', { min: 5, max: 100, fallback: 20 });
  const { rows, students, winnerSubmissions } = matchingSubmissions(req.query);
  const total = rows.length;
  const items = rows.slice((page - 1) * limit, page * limit).map((r) => ({
    id: r.id,
    submittedAt: r.submittedAt,
    student: studentSummary(students.get(r.studentId)),
    averagePercent: average(r.ratings),
    hasComment: Boolean(r.comment),
    isWinner: winnerSubmissions.has(r.id),
  }));
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

// Ids of every submission matching the search/filter, for "select all".
router.get('/submissions/ids', (req, res) => {
  res.json({ ids: matchingSubmissions(req.query).rows.map((r) => r.id) });
});

// Deletes submissions and their student records. Winners are stored separately: before a
// winner's submission is removed, its details and feedback are copied into the winner record.
router.post('/submissions/delete', async (req, res) => {
  const ids = (req.body || {}).ids;
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Select at least one submission to delete.');
  if (ids.length > 10000) throw new HttpError(400, 'Too many submissions in one request.');
  const wanted = new Set(ids.map((id) => cleanId(id, 'submission')));

  const result = await storage.transaction(['students', 'submissions', 'winners'], (d) => {
    const toDelete = d.submissions.filter((s) => wanted.has(s.id));
    const deleteIds = new Set(toDelete.map((s) => s.id));
    const deleteStudents = new Set(toDelete.map((s) => s.studentId));
    let winnersKept = 0;
    for (const w of d.winners) {
      if (!deleteIds.has(w.submissionId)) continue;
      winnersKept += 1;
      const sub = toDelete.find((s) => s.id === w.submissionId);
      if (!w.student) w.student = studentSnapshot(d.students.find((s) => s.id === sub.studentId));
      if (!w.feedback) w.feedback = feedbackSnapshot(sub);
    }
    d.submissions = d.submissions.filter((s) => !deleteIds.has(s.id));
    d.students = d.students.filter((s) => !deleteStudents.has(s.id));
    return { deleted: toDelete.length, winnersKept, notFound: wanted.size - toDelete.length };
  });
  res.json(result);
});

router.get('/submissions/:id', (req, res) => {
  const id = cleanId(req.params.id);
  const submission = storage.get('submissions').find((s) => s.id === id);
  if (!submission) throw new HttpError(404, 'Submission not found.');
  const student = storage.get('students').find((s) => s.id === submission.studentId);
  const winner = storage.get('winners').find((w) => w.submissionId === id);
  const selection = winner && storage.get('selections').find((s) => s.winnerId === winner.id);
  res.json({
    ...submission,
    student: studentSummary(student),
    averagePercent: average(submission.ratings),
    winner: winner
      ? { id: winner.id, declaredAt: winner.declaredAt, emailStatus: winner.emailStatus, emailError: winner.emailError, prizeName: selection ? selection.prizeName : null }
      : null,
  });
});

router.get('/summary', (req, res) => {
  const submissions = storage.get('submissions');
  const current = new Map(storage.get('attributes').map((a) => [a.id, a]));
  const stats = new Map();
  for (const sub of submissions) {
    for (const r of sub.ratings) {
      if (!stats.has(r.attributeId)) {
        const attr = current.get(r.attributeId);
        stats.set(r.attributeId, { attributeId: r.attributeId, name: attr ? attr.name : r.name, scale: attr ? attr.scale : r.scale, order: attr ? attr.order : 9999, active: attr ? attr.active : false, sum: 0, count: 0, distribution: {} });
      }
      if (r.value === null) continue;
      const s = stats.get(r.attributeId);
      s.sum += r.value;
      s.count += 1;
      s.distribution[r.value] = (s.distribution[r.value] || 0) + 1;
    }
  }
  const attributes = [...stats.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ sum, order, ...s }) => ({ ...s, average: s.count ? Math.round((sum / s.count) * 100) / 100 : null }));
  const winners = storage.get('winners');
  const selected = new Set(storage.get('selections').map((s) => s.winnerId));
  res.json({
    totalSubmissions: submissions.length,
    withComments: submissions.filter((s) => s.comment).length,
    totalWinners: winners.length,
    prizesSelected: winners.filter((w) => selected.has(w.id)).length,
    attributes,
  });
});

// ---------- Winners ----------
router.use('/winners', winnersRouter);

// ---------- Backup ----------
router.get('/backup', async (req, res) => {
  const bundle = await storage.snapshot();
  const name = `feedback-backup-${bundle.createdAt.replace(/[:.]/g, '-')}.json`;
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.set('Cache-Control', 'no-store');
  res.json(bundle);
});

module.exports = router;
