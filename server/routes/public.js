'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const storage = require('../lib/storage');
const { HttpError } = require('../lib/http');
const { activeSorted, categoryOf, roleOf, cleanRole } = require('../lib/content');
const { cleanString, cleanEmail, cleanMobile, truncate } = require('../lib/validate');

const router = express.Router();

// Generous limit: students in one college lab may share an IP address.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions from this network. Please try again in a few minutes.' },
});

router.get('/form', (req, res) => {
  const config = storage.getConfig();
  if (!config.formOpen) {
    return res.json({ title: config.formTitle, description: config.formDescription, open: false, questions: [], attributes: [] });
  }
  res.json({
    title: config.formTitle,
    description: config.formDescription,
    open: true,
    questions: activeSorted('questions').map((q) => ({ id: q.id, text: q.text, type: q.type, options: q.options, required: q.required, category: categoryOf(q), role: roleOf(q) })),
    attributes: activeSorted('attributes').map((a) => ({ id: a.id, name: a.name, description: a.description, scale: a.scale, required: a.required, category: categoryOf(a), role: roleOf(a) })),
  });
});

function buildAnswers(input, role) {
  const answers = [];
  for (const q of activeSorted('questions').filter((x) => roleOf(x) === role)) {
    const raw = input[q.id];
    const label = `"${truncate(q.text)}"`;
    let value;
    let empty;
    switch (q.type) {
      case 'short_text':
        value = cleanString(raw, label, { max: 500 });
        empty = !value;
        break;
      case 'long_text':
        value = cleanString(raw, label, { max: 5000, multiline: true });
        empty = !value;
        break;
      case 'single_choice':
        value = typeof raw === 'string' ? raw : '';
        if (value && !q.options.includes(value)) throw new HttpError(400, `Invalid option selected for ${label}.`);
        empty = !value;
        break;
      case 'multiple_choice': {
        const picked = Array.isArray(raw) ? raw : [];
        if (picked.some((v) => !q.options.includes(v))) throw new HttpError(400, `Invalid option selected for ${label}.`);
        value = q.options.filter((opt) => picked.includes(opt));
        empty = value.length === 0;
        break;
      }
      case 'yes_no':
        value = raw === 'yes' || raw === 'no' ? raw : '';
        empty = !value;
        break;
      default:
        continue;
    }
    if (q.required && empty) throw new HttpError(400, `Please answer the question ${label}.`);
    answers.push({ questionId: q.id, question: q.text, type: q.type, category: categoryOf(q), answer: value });
  }
  return answers;
}

function buildRatings(input, role) {
  const ratings = [];
  for (const a of activeSorted('attributes').filter((x) => roleOf(x) === role)) {
    const raw = input[a.id];
    const value = raw === undefined || raw === null || raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > a.scale)) {
      throw new HttpError(400, `Rating for "${a.name}" must be from 1 to ${a.scale}.`);
    }
    if (a.required && value === null) throw new HttpError(400, `Please rate "${a.name}".`);
    ratings.push({ attributeId: a.id, name: a.name, scale: a.scale, category: categoryOf(a), value });
  }
  return ratings;
}

router.post('/submissions', submitLimiter, async (req, res) => {
  if (!storage.getConfig().formOpen) throw new HttpError(403, 'The feedback form is currently closed.');
  const body = req.body || {};
  const role = cleanRole(body.role);
  const s = body.student || {};
  const { mobile, key: mobileKey } = cleanMobile(s.mobile);
  const student = {
    fullName: cleanString(s.fullName, 'Full name', { required: true, min: 2, max: 100 }),
    mobile,
    mobileKey,
    email: cleanEmail(s.email),
    college: cleanString(s.college, role === 'teacher' ? 'College / institution name' : 'College name', { required: true, min: 2, max: 150 }),
    role,
  };
  const answers = buildAnswers(body.answers && typeof body.answers === 'object' ? body.answers : {}, role);
  const ratings = buildRatings(body.ratings && typeof body.ratings === 'object' ? body.ratings : {}, role);
  const comment = cleanString(body.comment, 'Your feedback', { max: 5000, multiline: true });

  // The duplicate check runs inside the write lock, so two simultaneous submissions with the
  // same email or mobile number cannot both get through. Each person may submit once per role.
  await storage.transaction(['students', 'submissions'], (d) => {
    const duplicate = d.students.find((x) => roleOf(x) === role && (x.email === student.email || x.mobileKey === student.mobileKey));
    if (duplicate) {
      throw new HttpError(409, `Feedback has already been submitted as a ${role} with this email address or mobile number. Thank you!`);
    }
    const now = new Date().toISOString();
    const studentId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    d.submissions.push({ id: submissionId, studentId, role, answers, ratings, comment, submittedAt: now });
    d.students.push({ id: studentId, ...student, submissionId, createdAt: now });
  });
  res.status(201).json({ message: 'Thank you! Your feedback has been submitted successfully.' });
});

module.exports = router;
