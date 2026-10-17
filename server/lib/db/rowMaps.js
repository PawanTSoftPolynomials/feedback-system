'use strict';
// Converts between database rows (Prisma models) and the plain objects the app works with.
// The app keeps dates as ISO strings; the database stores real timestamps.
const { Prisma } = require('@prisma/client');

const toDate = (value) => (value ? new Date(value) : null);
const toDateRequired = (value) => (value ? new Date(value) : new Date());
const toIso = (value) => (value ? value.toISOString() : null);
const jsonOrNull = (value) => (value === undefined || value === null ? Prisma.DbNull : value);

/** Array collections: Prisma model name + row mapping in both directions. */
const ARRAY_MAPS = {
  students: {
    model: 'respondent',
    toRow: (s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      mobile: s.mobile,
      mobileKey: s.mobileKey || String(s.mobile || '').replace(/\D/g, '').slice(-10),
      college: s.college,
      role: s.role || 'student',
      submissionId: s.submissionId || null,
      createdAt: toDateRequired(s.createdAt),
    }),
    fromRow: (r) => ({
      id: r.id,
      fullName: r.fullName,
      mobile: r.mobile,
      mobileKey: r.mobileKey,
      email: r.email,
      college: r.college,
      role: r.role,
      submissionId: r.submissionId,
      createdAt: toIso(r.createdAt),
    }),
  },
  questions: {
    model: 'question',
    toRow: (q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      category: q.category || 'lms',
      role: q.role || 'student',
      options: Array.isArray(q.options) ? q.options : [],
      required: Boolean(q.required),
      active: q.active !== false,
      order: q.order ?? 0,
      createdAt: toDateRequired(q.createdAt),
      updatedAt: toDateRequired(q.updatedAt || q.createdAt),
    }),
    fromRow: (r) => ({
      id: r.id,
      text: r.text,
      type: r.type,
      category: r.category,
      role: r.role,
      options: r.options,
      required: r.required,
      active: r.active,
      order: r.order,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    }),
  },
  attributes: {
    model: 'ratingAttribute',
    toRow: (a) => ({
      id: a.id,
      name: a.name,
      description: a.description || '',
      category: a.category || 'lms',
      role: a.role || 'student',
      scale: a.scale ?? 5,
      required: a.required !== false,
      active: a.active !== false,
      order: a.order ?? 0,
      createdAt: toDateRequired(a.createdAt),
      updatedAt: toDateRequired(a.updatedAt || a.createdAt),
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      role: r.role,
      description: r.description,
      scale: r.scale,
      required: r.required,
      active: r.active,
      order: r.order,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    }),
  },
  submissions: {
    model: 'submission',
    toRow: (s) => ({
      id: s.id,
      studentId: s.studentId,
      role: s.role || 'student',
      answers: s.answers || [],
      ratings: s.ratings || [],
      comment: s.comment || '',
      submittedAt: toDateRequired(s.submittedAt),
    }),
    fromRow: (r) => ({
      id: r.id,
      studentId: r.studentId,
      role: r.role,
      answers: r.answers,
      ratings: r.ratings,
      comment: r.comment,
      submittedAt: toIso(r.submittedAt),
    }),
  },
  prizes: {
    model: 'prize',
    toRow: (p) => ({
      id: p.id,
      name: p.name,
      type: p.type || '',
      description: p.description || '',
      value: p.value || '',
      active: p.active !== false,
      order: p.order ?? 0,
      createdAt: toDateRequired(p.createdAt),
      updatedAt: toDateRequired(p.updatedAt || p.createdAt),
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      value: r.value,
      active: r.active,
      order: r.order,
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    }),
  },
  winners: {
    model: 'winner',
    toRow: (w) => ({
      id: w.id,
      submissionId: w.submissionId,
      studentId: w.studentId,
      student: jsonOrNull(w.student),
      feedback: jsonOrNull(w.feedback),
      declaredAt: toDateRequired(w.declaredAt),
      tokenHash: w.tokenHash,
      tokenCreatedAt: toDateRequired(w.tokenCreatedAt || w.declaredAt),
      allowChange: Boolean(w.allowChange),
      emailStatus: w.emailStatus || 'failed',
      emailRequestedAt: toDate(w.emailRequestedAt),
      emailAttempts: w.emailAttempts || 0,
      emailError: w.emailError || null,
      emailSentAt: toDate(w.emailSentAt),
      emailMessageId: w.emailMessageId || null,
    }),
    fromRow: (r) => ({
      id: r.id,
      submissionId: r.submissionId,
      studentId: r.studentId,
      student: r.student,
      feedback: r.feedback,
      declaredAt: toIso(r.declaredAt),
      tokenHash: r.tokenHash,
      tokenCreatedAt: toIso(r.tokenCreatedAt),
      allowChange: r.allowChange,
      emailStatus: r.emailStatus,
      emailRequestedAt: toIso(r.emailRequestedAt),
      emailAttempts: r.emailAttempts,
      emailError: r.emailError,
      emailSentAt: toIso(r.emailSentAt),
      emailMessageId: r.emailMessageId,
    }),
  },
  selections: {
    model: 'prizeSelection',
    toRow: (s) => ({
      id: s.id,
      winnerId: s.winnerId,
      studentId: s.studentId,
      prizeId: s.prizeId,
      prizeName: s.prizeName,
      prizeType: s.prizeType || '',
      selectedAt: toDateRequired(s.selectedAt),
      history: s.history || [],
    }),
    fromRow: (r) => ({
      id: r.id,
      winnerId: r.winnerId,
      studentId: r.studentId,
      prizeId: r.prizeId,
      prizeName: r.prizeName,
      prizeType: r.prizeType,
      selectedAt: toIso(r.selectedAt),
      history: r.history,
    }),
  },
};

/** Single-row collections (stored with id = 1). An empty object means "no row". */
const OBJECT_MAPS = {
  config: {
    model: 'appSettings',
    toRow: (c) => ({ formTitle: c.formTitle, formDescription: c.formDescription || '', formOpen: c.formOpen !== false }),
    fromRow: (r) => ({ formTitle: r.formTitle, formDescription: r.formDescription, formOpen: r.formOpen }),
    isEmpty: (c) => !c || !c.formTitle,
  },
  admin: {
    model: 'adminAccount',
    toRow: (a) => ({ username: a.username, passwordHash: a.passwordHash, passwordChangedAt: toDateRequired(a.passwordChangedAt), createdAt: toDateRequired(a.createdAt) }),
    fromRow: (r) => ({ username: r.username, passwordHash: r.passwordHash, passwordChangedAt: toIso(r.passwordChangedAt), createdAt: toIso(r.createdAt) }),
    isEmpty: (a) => !a || !a.passwordHash,
  },
};

/** Parents before children: inserts/updates run in this order, deletes in reverse. */
const WRITE_ORDER = ['admin', 'config', 'students', 'questions', 'attributes', 'prizes', 'submissions', 'winners', 'selections'];

module.exports = { ARRAY_MAPS, OBJECT_MAPS, WRITE_ORDER };
