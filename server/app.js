'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { PROJECT_ROOT } = require('./lib/env');
const { errorHandler } = require('./lib/http');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of the app
  app.disable('x-powered-by');
  // Render already redirects to HTTPS; skipping upgrade-insecure-requests keeps plain-HTTP local runs working.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/portal', require('./routes/portal'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', require('./routes/public'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Only the built React app is served statically. The data directory is never exposed.
  const dist = path.join(PROJECT_ROOT, 'client', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '7d' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    console.warn('[server] client/dist not found: only the API is served. Run "npm run build" (on Render use the build command "npm install && npm run build").');
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
