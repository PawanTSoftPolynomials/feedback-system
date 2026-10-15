'use strict';
const { HttpError } = require('./http');

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // eslint-disable-line no-control-regex
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanString(value, label, { max = 200, min = 0, required = false, multiline = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  let s = value.replace(CONTROL_CHARS, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (required && !s) throw new HttpError(400, `${label} is required.`);
  if (s && s.length < min) throw new HttpError(400, `${label} must be at least ${min} characters.`);
  if (s.length > max) throw new HttpError(400, `${label} must be at most ${max} characters.`);
  return s;
}

function cleanBool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function cleanInt(value, label, { min, max, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

function cleanEmail(value) {
  const email = cleanString(value, 'Email address', { required: true, max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  return email;
}

/** Returns the display value and a key (last 10 digits) used for duplicate detection. */
function cleanMobile(value) {
  const raw = cleanString(value, 'Mobile number', { required: true, max: 20 });
  const digits = raw.replace(/\D/g, '');
  if (!/^\+?[\d\s()-]+$/.test(raw) || digits.length < 10 || digits.length > 15) {
    throw new HttpError(400, 'Please enter a valid mobile number (10 to 15 digits).');
  }
  return { mobile: (raw.startsWith('+') ? '+' : '') + digits, key: digits.slice(-10) };
}

function cleanId(value, label = 'id') {
  if (typeof value !== 'string' || !/^[\w-]{1,64}$/.test(value)) throw new HttpError(400, `Invalid ${label}.`);
  return value;
}

function truncate(text, n = 60) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

module.exports = { cleanString, cleanBool, cleanInt, cleanEmail, cleanMobile, cleanId, truncate };
