'use strict';
// Winner management (mounted under /api/admin/winners, admin-only).
const crypto = require('crypto');
const express = require('express');
const storage = require('../lib/storage');
const mail = require('../lib/mail');
const { HttpError } = require('../lib/http');
const { newToken, hashToken } = require('../lib/tokens');
const { cleanId, cleanBool } = require('../lib/validate');

const router = express.Router();
const SENDING_TIMEOUT_MS = 2 * 60 * 1000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function publicBaseUrl(req) {
  const base = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
  return base.replace(/\/+$/, '');
}

function winnerEmail(name, link) {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:32px">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:22px;color:#c2410c">Congratulations, ${safeName}!</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Thank you for sharing your feedback. You have been selected as one of our winners.</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px">Click the button below to choose your prize. You can select one prize from the available options.</p>
        <p style="margin:0 0 24px"><a href="${safeLink}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold">Choose my prize</a></p>
        <p style="font-size:13px;line-height:1.6;color:#52606d;margin:0 0 8px">If the button does not work, copy this link into your browser:<br><a href="${safeLink}" style="color:#c2410c;word-break:break-all">${safeLink}</a></p>
        <p style="font-size:13px;line-height:1.6;color:#52606d;margin:0">This link is personal. Please do not share it with anyone.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function winnerRow(w, students, selections) {
  const s = students.get(w.studentId);
  const sel = selections.get(w.id);
  return {
    id: w.id,
    submissionId: w.submissionId,
    declaredAt: w.declaredAt,
    student: s ? { fullName: s.fullName, email: s.email, mobile: s.mobile, college: s.college } : null,
    emailStatus: w.emailStatus,
    emailError: w.emailError || null,
    emailSentAt: w.emailSentAt || null,
    emailAttempts: w.emailAttempts || 0,
    allowChange: Boolean(w.allowChange),
    selection: sel ? { prizeId: sel.prizeId, prizeName: sel.prizeName, prizeType: sel.prizeType, selectedAt: sel.selectedAt, history: sel.history || [] } : null,
  };
}

function rowFor(winnerId) {
  const w = storage.get('winners').find((x) => x.id === winnerId);
  if (!w) return null;
  return winnerRow(w, new Map(storage.get('students').map((s) => [s.id, s])), new Map(storage.get('selections').map((s) => [s.winnerId, s])));
}

/**
 * Sends the prize link and records the real outcome. The status only becomes "sent"
 * after Brevo accepted the email; any failure is stored as "failed" with the reason.
 */
async function deliver(winnerId, token, req) {
  const winner = storage.get('winners').find((w) => w.id === winnerId);
  const student = storage.get('students').find((s) => s.id === winner.studentId);
  const link = `${publicBaseUrl(req)}/prize/${token}`;
  let update;
  try {
    const result = await mail.sendEmail(student.email, 'Congratulations! Choose your prize', winnerEmail(student.fullName, link));
    update = { emailStatus: 'sent', emailError: null, emailSentAt: new Date().toISOString(), emailMessageId: (result && result.messageId) || null };
  } catch (err) {
    update = { emailStatus: 'failed', emailError: String(err.message || err).slice(0, 300) };
  }
  await storage.transaction(['winners'], (d) => {
    const w = d.winners.find((x) => x.id === winnerId);
    if (w && w.tokenHash === hashToken(token)) Object.assign(w, update);
  });
  return rowFor(winnerId);
}

function isSending(w) {
  return w.emailStatus === 'sending' && Date.now() - new Date(w.emailRequestedAt).getTime() < SENDING_TIMEOUT_MS;
}

router.get('/', (req, res) => {
  const filter = ['selected', 'pending'].includes(req.query.filter) ? req.query.filter : 'all';
  const students = new Map(storage.get('students').map((s) => [s.id, s]));
  const selections = new Map(storage.get('selections').map((s) => [s.winnerId, s]));
  let rows = storage.get('winners').map((w) => winnerRow(w, students, selections)).reverse();
  if (filter === 'selected') rows = rows.filter((r) => r.selection);
  if (filter === 'pending') rows = rows.filter((r) => !r.selection);
  res.json(rows);
});

// Winners are only ever declared manually by the admin through this endpoint.
router.post('/', async (req, res) => {
  const submissionId = cleanId((req.body || {}).submissionId, 'submission');
  const token = newToken();
  const winnerId = await storage.transaction(['winners'], (d) => {
    const submission = storage.get('submissions').find((s) => s.id === submissionId);
    if (!submission) throw new HttpError(404, 'Submission not found.');
    if (d.winners.some((w) => w.submissionId === submissionId)) throw new HttpError(409, 'This student has already been declared a winner.');
    const now = new Date().toISOString();
    const winner = {
      id: crypto.randomUUID(),
      submissionId,
      studentId: submission.studentId,
      declaredAt: now,
      tokenHash: hashToken(token),
      tokenCreatedAt: now,
      allowChange: false,
      emailStatus: 'sending',
      emailRequestedAt: now,
      emailAttempts: 1,
      emailError: null,
      emailSentAt: null,
    };
    d.winners.push(winner);
    return winner.id;
  });
  const row = await deliver(winnerId, token, req);
  res.status(201).json(row);
});

// Issues a fresh link (the previous link stops working) and emails it again.
router.post('/:id/resend', async (req, res) => {
  const id = cleanId(req.params.id);
  const token = newToken();
  await storage.transaction(['winners'], (d) => {
    const w = d.winners.find((x) => x.id === id);
    if (!w) throw new HttpError(404, 'Winner not found.');
    if (isSending(w)) throw new HttpError(409, 'An email is already being sent to this winner. Please wait a moment.');
    const now = new Date().toISOString();
    Object.assign(w, { tokenHash: hashToken(token), tokenCreatedAt: now, emailStatus: 'sending', emailRequestedAt: now, emailAttempts: (w.emailAttempts || 0) + 1 });
  });
  res.json(await deliver(id, token, req));
});

router.put('/:id/allow-change', async (req, res) => {
  const id = cleanId(req.params.id);
  const allow = cleanBool((req.body || {}).allowChange, false);
  await storage.transaction(['winners'], (d) => {
    const w = d.winners.find((x) => x.id === id);
    if (!w) throw new HttpError(404, 'Winner not found.');
    w.allowChange = allow;
  });
  res.json(rowFor(id));
});

router.delete('/:id', async (req, res) => {
  const id = cleanId(req.params.id);
  await storage.transaction(['winners'], (d) => {
    if (!d.winners.some((w) => w.id === id)) throw new HttpError(404, 'Winner not found.');
    if (storage.get('selections').some((s) => s.winnerId === id)) {
      throw new HttpError(409, 'This winner has already selected a prize and cannot be removed.');
    }
    d.winners = d.winners.filter((w) => w.id !== id);
  });
  res.status(204).end();
});

module.exports = router;
