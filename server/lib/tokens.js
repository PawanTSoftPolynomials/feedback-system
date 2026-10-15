'use strict';
const crypto = require('crypto');

// 256 bits of randomness; only the SHA-256 hash is stored on disk.
const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { newToken, hashToken };
