'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const storage = require('./storage');
const { HttpError } = require('./http');

let secret = null;

function getSecret() {
  if (!secret) {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
      secret = process.env.JWT_SECRET;
    } else {
      secret = crypto.randomBytes(48).toString('hex');
      console.warn('[auth] JWT_SECRET is missing or shorter than 32 characters; using a temporary secret. Admin sessions will end when the server restarts.');
    }
  }
  return secret;
}

/**
 * Creates the admin account from ADMIN_USERNAME / ADMIN_PASSWORD on first start.
 * Only a bcrypt hash is stored. An existing account is never changed unless
 * ADMIN_RESET_PASSWORD=true is set.
 */
async function ensureAdmin() {
  const admin = storage.get('admin');
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD;
  const reset = process.env.ADMIN_RESET_PASSWORD === 'true';

  if (admin.passwordHash && !reset) {
    if (password) console.log('[auth] Admin account already exists; ADMIN_PASSWORD is ignored and can be removed from the environment.');
    return;
  }
  if (!password) {
    console.warn('[auth] No admin password available. Set ADMIN_PASSWORD (at least 8 characters) and restart to create the admin account.');
    return;
  }
  if (password.length < 8) {
    console.warn('[auth] ADMIN_PASSWORD must be at least 8 characters. Admin account was not changed.');
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();
  await storage.transaction(['admin'], (d) => {
    d.admin = { username, passwordHash, passwordChangedAt: now, createdAt: d.admin.createdAt || now };
  });
  console.log(reset && admin.passwordHash
    ? `[auth] Admin password reset for "${username}". Remove ADMIN_RESET_PASSWORD now.`
    : `[auth] Admin account "${username}" created.`);
}

async function login(username, password) {
  const admin = storage.get('admin');
  if (!admin.passwordHash) throw new HttpError(503, 'The admin account has not been set up yet. Set ADMIN_PASSWORD on the server and restart it.');
  const userOk = typeof username === 'string' && username.trim().toLowerCase() === admin.username.toLowerCase();
  const passOk = await bcrypt.compare(typeof password === 'string' ? password : '', admin.passwordHash);
  if (!userOk || !passOk) throw new HttpError(401, 'Invalid username or password.');
  return {
    token: jwt.sign({ sub: admin.username, pv: admin.passwordChangedAt }, getSecret(), { expiresIn: '8h' }),
    username: admin.username,
  };
}

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please log in as admin.'));
  try {
    const payload = jwt.verify(token, getSecret());
    const admin = storage.get('admin');
    if (payload.sub !== admin.username || payload.pv !== admin.passwordChangedAt) throw new Error('stale');
    req.admin = { username: admin.username };
    next();
  } catch {
    next(new HttpError(401, 'Your admin session has expired. Please log in again.'));
  }
}

module.exports = { ensureAdmin, login, requireAdmin, getSecret };
