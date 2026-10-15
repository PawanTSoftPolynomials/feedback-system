'use strict';
// Shared helpers for questions and rating attributes.
const storage = require('./storage');
const { HttpError } = require('./http');
const { cleanString, cleanBool, cleanInt } = require('./validate');

const QUESTION_TYPES = ['short_text', 'long_text', 'single_choice', 'multiple_choice', 'yes_no'];
// Feedback sections. Questions and rating attributes each belong to one of these.
const CATEGORIES = ['lms', 'course'];
const DEFAULT_CATEGORY = 'lms';

/** Category of a stored question/attribute; items created before categories existed count as LMS. */
const categoryOf = (item) => (CATEGORIES.includes(item.category) ? item.category : DEFAULT_CATEGORY);

function cleanCategory(value, fallback = DEFAULT_CATEGORY) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!CATEGORIES.includes(v)) throw new HttpError(400, `Category must be one of: ${CATEGORIES.join(', ')}.`);
  return v;
}
const CHOICE_TYPES = ['single_choice', 'multiple_choice'];

const byOrder = (a, b) => a.order - b.order;
const sortedList = (name) => [...storage.get(name)].sort(byOrder);
const activeSorted = (name) => sortedList(name).filter((item) => item.active !== false);

function sanitizeQuestion(body, defaultCategory) {
  const type = body.type;
  if (!QUESTION_TYPES.includes(type)) throw new HttpError(400, `Question type must be one of: ${QUESTION_TYPES.join(', ')}.`);
  let options = [];
  if (CHOICE_TYPES.includes(type)) {
    if (!Array.isArray(body.options)) throw new HttpError(400, 'Choice questions need a list of options.');
    const seen = new Set();
    for (const raw of body.options) {
      const opt = cleanString(raw, 'Option', { max: 150 });
      if (opt && !seen.has(opt.toLowerCase())) {
        seen.add(opt.toLowerCase());
        options.push(opt);
      }
    }
    if (options.length < 2) throw new HttpError(400, 'Choice questions need at least 2 different options.');
    if (options.length > 20) throw new HttpError(400, 'A question can have at most 20 options.');
  }
  return {
    text: cleanString(body.text, 'Question text', { required: true, max: 300 }),
    type,
    category: cleanCategory(body.category, defaultCategory),
    options,
    required: cleanBool(body.required, false),
    active: cleanBool(body.active, true),
  };
}

function sanitizeAttribute(body) {
  return {
    name: cleanString(body.name, 'Attribute name', { required: true, max: 100 }),
    category: cleanCategory(body.category),
    description: cleanString(body.description, 'Description', { max: 300 }),
    scale: cleanInt(body.scale, 'Rating scale', { min: 2, max: 10, fallback: 5 }),
    required: cleanBool(body.required, true),
    active: cleanBool(body.active, true),
  };
}

function sanitizePrize(body) {
  return {
    name: cleanString(body.name, 'Prize name', { required: true, max: 100 }),
    type: cleanString(body.type, 'Prize type', { max: 60 }),
    description: cleanString(body.description, 'Description', { max: 500, multiline: true }),
    value: cleanString(body.value, 'Value / details', { max: 100 }),
    active: cleanBool(body.active, true),
  };
}

// Copies kept inside each winner record, so a winner stays complete even if the
// original feedback submission is deleted later.
function studentSnapshot(s) {
  return s ? { fullName: s.fullName, email: s.email, mobile: s.mobile, college: s.college } : null;
}

function feedbackSnapshot(sub) {
  return sub ? { answers: sub.answers, ratings: sub.ratings, comment: sub.comment, submittedAt: sub.submittedAt } : null;
}

/** Winner's stored details, falling back to the live student record for older winners. */
function winnerStudent(winner) {
  return winner.student || studentSnapshot(storage.get('students').find((s) => s.id === winner.studentId));
}

module.exports = {
  CATEGORIES,
  DEFAULT_CATEGORY,
  categoryOf,
  cleanCategory,
  studentSnapshot,
  feedbackSnapshot,
  winnerStudent,
  QUESTION_TYPES,
  sortedList,
  activeSorted,
  sanitizeQuestion,
  sanitizeAttribute,
  sanitizePrize,
};
