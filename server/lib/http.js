'use strict';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in request body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

module.exports = { HttpError, errorHandler };
