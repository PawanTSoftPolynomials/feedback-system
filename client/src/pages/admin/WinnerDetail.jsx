import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Loading } from '../../components/ui.jsx';
import FeedbackContent from '../../components/FeedbackContent.jsx';
import { roleLabel } from '../../categories.js';
import { EmailStatus, deleteWinnersMessage } from './WinnersPage.jsx';

/** A single winner's stored record: details, email status, prize choice and feedback. */
export default function WinnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [winner, setWinner] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.get(`/admin/winners/${id}`).then(setWinner).catch((err) => setError(err.message));
  }, [id]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const update = (row) => setWinner((w) => ({ ...w, ...row }));

  const resend = () => act(async () => {
    if (!window.confirm(`Send a new prize link to ${winner.student?.email}? Any previous link will stop working.`)) return;
    const row = await adminApi.post(`/admin/winners/${id}/resend`);
    update(row);
    if (row.emailStatus === 'sent') setNotice(`A new prize link was emailed to ${row.student?.email}.`);
    else setError(`The email could not be sent: ${row.emailError}`);
  });

  const toggleChange = () => act(async () => {
    update(await adminApi.put(`/admin/winners/${id}/allow-change`, { allowChange: !winner.allowChange }));
  });

  const remove = () => act(async () => {
    if (!window.confirm(deleteWinnersMessage([winner]))) return;
    await adminApi.del(`/admin/winners/${id}`);
    navigate('/admin/winners', { replace: true });
  });

  if (error && !winner) return <><p><Link to="/admin/winners">← Back to winners</Link></p><Alert>{error}</Alert></>;
  if (!winner) return <Loading />;
  const { student, selection, feedback } = winner;

  return (
    <>
      <p><Link to="/admin/winners">← Back to winners</Link></p>
      <div className="page-head">
        <h1>{student?.fullName || 'Winner'} <Badge tone="success">Winner</Badge></h1>
        <button className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>Delete winner</button>
      </div>
      <Alert type="success">{notice}</Alert>
      <Alert>{error}</Alert>

      <div className="grid-2">
        <section className="card">
          <h2>Winner details</h2>
          <dl className="details">
            <dt>Role</dt><dd>{roleLabel(student?.role)}</dd>
            <dt>Email</dt><dd>{student?.email || '—'}</dd>
            <dt>Mobile</dt><dd>{student?.mobile || '—'}</dd>
            <dt>College</dt><dd>{student?.college || '—'}</dd>
            <dt>Declared</dt><dd>{formatDate(winner.declaredAt)}</dd>
            <dt>Feedback</dt>
            <dd>
              {winner.submissionExists
                ? <Link to={`/admin/feedback/${winner.submissionId}`}>Open original submission</Link>
                : <span className="muted">Original submission deleted (copy kept below)</span>}
            </dd>
          </dl>
        </section>
        <section className="card">
          <h2>Prize</h2>
          {selection ? (
            <>
              <p className="prize-chosen">{selection.prizeName}</p>
              {selection.prizeType && <p className="muted">{selection.prizeType}</p>}
              <p className="muted small">Selected {formatDate(selection.selectedAt)}</p>
              {selection.history.length > 0 && (
                <p className="muted small">Earlier choices: {selection.history.map((h) => `${h.prizeName} (${formatDate(h.selectedAt)})`).join(', ')}</p>
              )}
              {winner.allowChange && <p><Badge tone="warning">Change allowed</Badge></p>}
            </>
          ) : <p><Badge>Not selected yet</Badge></p>}
          <p>Email: <EmailStatus status={winner.emailStatus} error={winner.emailError} /></p>
          {winner.emailSentAt && <p className="muted small">Last sent {formatDate(winner.emailSentAt)} · {winner.emailAttempts} attempt(s)</p>}
          <div className="row-actions">
            <button className="btn btn-secondary btn-sm" onClick={resend} disabled={busy}>{winner.emailStatus === 'failed' ? 'Retry email' : 'Resend link'}</button>
            {selection && (
              <button className="btn btn-secondary btn-sm" onClick={toggleChange} disabled={busy}>{winner.allowChange ? 'Lock selection' : 'Allow change'}</button>
            )}
          </div>
        </section>
      </div>

      {feedback
        ? <FeedbackContent answers={feedback.answers} ratings={feedback.ratings} comment={feedback.comment} />
        : <section className="card"><p className="muted">No feedback copy is stored for this winner.</p></section>}
    </>
  );
}
