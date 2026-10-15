'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const storage = require('../lib/storage');
const { HttpError } = require('../lib/http');
const { activeSorted } = require('../lib/content');
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
    questions: activeSorted('questions').map(({ id, text, type, options, required }) => ({ id, text, type, options, required })),
    attributes: activeSorted('attributes').map(({ id, name, description, scale, required }) => ({ id, name, description, scale, required })),
  });
});

function buildAnswers(input) {
  const answers = [];
  for (const q of activeSorted('questions')) {
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
    answers.push({ questionId: q.id, question: q.text, type: q.type, answer: value });
  }
  return answers;
}

function buildRatings(input) {
  const ratings = [];
  for (const a of activeSorted('attributes')) {
    const raw = input[a.id];
    const value = raw === undefined || raw === null || raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > a.scale)) {
      throw new HttpError(400, `Rating for "${a.name}" must be from 1 to ${a.scale}.`);
    }
    if (a.required && value === null) throw new HttpError(400, `Please rate "${a.name}".`);
    ratings.push({ attributeId: a.id, name: a.name, scale: a.scale, value });
  }
  return ratings;
}

router.post('/submissions', submitLimiter, async (req, res) => {
  if (!storage.getConfig().formOpen) throw new HttpError(403, 'The feedback form is currently closed.');
  const body = req.body || {};
  const s = body.student || {};
  const { mobile, key: mobileKey } = cleanMobile(s.mobile);
  const student = {
    fullName: cleanString(s.fullName, 'Full name', { required: true, min: 2, max: 100 }),
    mobile,
    mobileKey,
    email: cleanEmail(s.email),
    college: cleanString(s.college, 'College name', { required: true, min: 2, max: 150 }),
  };
  const answers = buildAnswers(body.answers && typeof body.answers === 'object' ? body.answers : {});
  const ratings = buildRatings(body.ratings && typeof body.ratings === 'object' ? body.ratings : {});
  const comment = cleanString(body.comment, 'Your feedback', { max: 5000, multiline: true });

  // The duplicate check runs inside the write lock, so two simultaneous submissions
  // with the same email or mobile number cannot both get through.
  await storage.transaction(['students', 'submissions'], (d) => {
    const duplicate = d.students.find((x) => x.email === student.email || x.mobileKey === student.mobileKey);
    if (duplicate) {
      throw new HttpError(409, 'Feedback has already been submitted with this email address or mobile number. Thank you!');
    }
    const now = new Date().toISOString();
    const studentId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    d.submissions.push({ id: submissionId, studentId, answers, ratings, comment, submittedAt: now });
    d.students.push({ id: studentId, ...student, submissionId, createdAt: now });
  });
  res.status(201).json({ message: 'Thank you! Your feedback has been submitted successfully.' });
});

module.exports = router;
