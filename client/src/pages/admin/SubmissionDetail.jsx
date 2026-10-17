import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Loading } from '../../components/ui.jsx';
import FeedbackContent from '../../components/FeedbackContent.jsx';
import { roleLabel } from '../../categories.js';
import { EmailStatus } from './WinnersPage.jsx';
import { useLiveRefresh } from '../../live.js';

export default function SubmissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => adminApi.get(`/admin/submissions/${id}`).then(setSub).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(() => { if (!busy) load(); });

  const declareWinner = async () => {
    if (!window.confirm(`Declare ${sub.student?.fullName} as a winner? A prize-selection email will be sent to ${sub.student?.email}.`)) return;
    setBusy(true);
    setError('');
    try {
      const winner = await adminApi.post('/admin/winners', { submissionId: id });
      setNotice(winner.emailStatus === 'sent'
        ? { type: 'success', text: 'Winner declared and the prize-selection email was sent.' }
        : { type: 'error', text: `Winner declared, but the email could not be sent: ${winner.emailError}. You can retry from the winner's page.` });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteSubmission = async () => {
    const extra = sub.winner ? ' The winner record (with a copy of these details) stays on the Winners page.' : '';
    if (!window.confirm(`Permanently delete the feedback from ${sub.student?.fullName} and their student details? This cannot be undone.${extra}`)) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.post('/admin/submissions/delete', { ids: [id] });
      navigate('/admin/feedback', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (error && !sub) return <Alert>{error}</Alert>;
  if (!sub) return <Loading />;

  return (
    <>
      <p><Link to="/admin/feedback">← Back to feedback</Link></p>
      <div className="page-head">
        <h1>{sub.student?.fullName || 'Unknown student'}</h1>
        <button className="btn btn-danger btn-sm" onClick={deleteSubmission} disabled={busy}>Delete feedback</button>
      </div>
      {notice && <Alert type={notice.type}>{notice.text}</Alert>}
      <Alert>{error}</Alert>

      <div className="grid-2">
        <section className="card">
          <h2>{roleLabel(sub.role)} details</h2>
          <dl className="details">
            <dt>Role</dt><dd>{roleLabel(sub.role)}</dd>
            <dt>Email</dt><dd>{sub.student?.email}</dd>
            <dt>Mobile</dt><dd>{sub.student?.mobile}</dd>
            <dt>College</dt><dd>{sub.student?.college}</dd>
            <dt>Submitted</dt><dd>{formatDate(sub.submittedAt)}</dd>
            <dt>Average rating</dt><dd>{sub.averagePercent === null ? '—' : `${sub.averagePercent}%`}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Winner status</h2>
          {sub.winner ? (
            <>
              <p><Badge tone="success">Winner</Badge> declared {formatDate(sub.winner.declaredAt)}</p>
              <p>Email: <EmailStatus status={sub.winner.emailStatus} error={sub.winner.emailError} /></p>
              <p>Prize: {sub.winner.prizeName ? <strong>{sub.winner.prizeName}</strong> : <span className="muted">Not selected yet</span>}</p>
              <Link to={`/admin/winners/${sub.winner.id}`}>Open winner record →</Link>
            </>
          ) : (
            <>
              <p className="muted">This student has not been declared a winner.</p>
              <button className="btn btn-primary" onClick={declareWinner} disabled={busy}>{busy ? 'Working…' : 'Declare as winner'}</button>
            </>
          )}
        </section>
      </div>

      <FeedbackContent answers={sub.answers} ratings={sub.ratings} comment={sub.comment} />
    </>
  );
}
