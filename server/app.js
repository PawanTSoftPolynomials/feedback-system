'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { PROJECT_ROOT } = require('./lib/env');
const { errorHandler } = require('./lib/http');
const crypto = require('crypto');
const storage = require('./lib/storage');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of the app
  app.disable('x-powered-by');
  // Render already redirects to HTTPS; skipping upgrade-insecure-requests keeps plain-HTTP local runs working.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // Database mode: pick up changes made by another server (e.g. local + Render) before answering.
  app.use('/api', async (req, res, next) => {
    await storage.refresh();
    next();
  });

  // Polled by every open page: `version` changes when data changes, `build` when a new frontend is deployed.
  const dist = path.join(PROJECT_ROOT, 'client', 'dist');
  const indexFile = path.join(dist, 'index.html');
  const build = fs.existsSync(indexFile) ? crypto.createHash('sha1').update(fs.readFileSync(indexFile)).digest('hex').slice(0, 12) : 'dev';
  app.get('/api/live', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ version: storage.dataVersion(), build });
  });
  app.use('/api/portal', require('./routes/portal'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', require('./routes/public'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Only the built React app is served statically. The data directory is never exposed.
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
