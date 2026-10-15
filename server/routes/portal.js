'use strict';
// Prize selection portal. Winners authenticate with the secret token from their email;
// the token is sent in the request body (not the URL) and only its hash is stored.
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const storage = require('../lib/storage');
const { HttpError } = require('../lib/http');
const { hashToken } = require('../lib/tokens');
const { cleanId } = require('../lib/validate');
const { winnerStudent } = require('../lib/content');

const router = express.Router();

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
}));

const INVALID_LINK = 'This prize link is invalid or no longer active. Please use the latest link sent to your email, or contact the organiser.';

function findWinnerIndex(winners, token) {
  if (typeof token !== 'string' || token.length < 30 || token.length > 100) throw new HttpError(404, INVALID_LINK);
  const hash = hashToken(token);
  const index = winners.findIndex((w) => w.tokenHash === hash);
  if (index === -1) throw new HttpError(404, INVALID_LINK);
  return index;
}

function publicSelection(selection) {
  return selection ? { prizeId: selection.prizeId, prizeName: selection.prizeName, prizeType: selection.prizeType, selectedAt: selection.selectedAt } : null;
}

function portalView(winner) {
  const student = winnerStudent(winner);
  const selection = storage.get('selections').find((s) => s.winnerId === winner.id);
  const prizes = storage.get('prizes')
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order)
    .map(({ id, name, type, description, value }) => ({ id, name, type, description, value }));
  return {
    name: student ? student.fullName : 'Winner',
    selection: publicSelection(selection),
    canSelect: !selection || Boolean(winner.allowChange),
    prizes,
  };
}

router.post('/session', (req, res) => {
  const winners = storage.get('winners');
  const winner = winners[findWinnerIndex(winners, (req.body || {}).token)];
  res.json(portalView(winner));
});

router.post('/select', async (req, res) => {
  const body = req.body || {};
  const prizeId = cleanId(body.prizeId, 'prize');
  const winnerId = await storage.transaction(['winners', 'selections'], (d) => {
    const winner = d.winners[findWinnerIndex(d.winners, body.token)];
    const prize = storage.get('prizes').find((p) => p.id === prizeId);
    if (!prize || !prize.active) throw new HttpError(400, 'This prize is no longer available. Please choose another one.');

    const now = new Date().toISOString();
    const existing = d.selections.find((s) => s.winnerId === winner.id);
    if (existing) {
      if (!winner.allowChange) throw new HttpError(409, 'You have already selected your prize. It cannot be changed.');
      existing.history = [...(existing.history || []), { prizeId: existing.prizeId, prizeName: existing.prizeName, selectedAt: existing.selectedAt }];
      Object.assign(existing, { prizeId: prize.id, prizeName: prize.name, prizeType: prize.type, selectedAt: now });
    } else {
      d.selections.push({
        id: crypto.randomUUID(),
        winnerId: winner.id,
        studentId: winner.studentId,
        prizeId: prize.id,
        prizeName: prize.name,
        prizeType: prize.type,
        selectedAt: now,
        history: [],
      });
    }
    winner.allowChange = false; // a permitted change can be used only once
    return winner.id;
  });
  const winner = storage.get('winners').find((w) => w.id === winnerId);
  res.json({ message: 'Your prize selection has been confirmed.', ...portalView(winner) });
});

module.exports = router;
