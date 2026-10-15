import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Loading } from '../../components/ui.jsx';
import { EmailStatus } from './WinnersPage.jsx';

function formatAnswer(a) {
  if (Array.isArray(a.answer)) return a.answer.length ? a.answer.join(', ') : '—';
  if (a.type === 'yes_no') return a.answer === 'yes' ? 'Yes' : a.answer === 'no' ? 'No' : '—';
  return a.answer || '—';
}

export default function SubmissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => adminApi.get(`/admin/submissions/${id}`).then(setSub).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const declareWinner = async () => {
    if (!window.confirm(`Declare ${sub.student?.fullName} as a winner? A prize-selection email will be sent to ${sub.student?.email}.`)) return;
    setBusy(true);
    setError('');
    try {
      const winner = await adminApi.post('/admin/winners', { submissionId: id });
      setNotice(winner.emailStatus === 'sent'
        ? { type: 'success', text: 'Winner declared and the prize-selection email was sent.' }
        : { type: 'error', text: `Winner declared, but the email could not be sent: ${winner.emailError}. You can retry from the Winners page.` });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteSubmission = async () => {
    if (!window.confirm(`Permanently delete the feedback from ${sub.student?.fullName} and their student details? This cannot be undone.`)) return;
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
      <h1>{sub.student?.fullName || 'Unknown student'}</h1>
      {notice && <Alert type={notice.type}>{notice.text}</Alert>}
      <Alert>{error}</Alert>

      <div className="grid-2">
        <section className="card">
          <h2>Student details</h2>
          <dl className="details">
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
              <Link to="/admin/winners">Manage winners →</Link>
            </>
          ) : (
            <>
              <p className="muted">This student has not been declared a winner.</p>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={declareWinner} disabled={busy}>{busy ? 'Working…' : 'Declare as winner'}</button>
                <button className="btn btn-danger" onClick={deleteSubmission} disabled={busy}>Delete feedback</button>
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Answers</h2>
        {sub.answers.length === 0 ? <p className="muted">No questions were answered.</p> : (
          <dl className="answers">
            {sub.answers.map((a) => (
              <div key={a.questionId}>
                <dt>{a.question}</dt>
                <dd className="pre-wrap">{formatAnswer(a)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="card">
        <h2>Ratings</h2>
        {sub.ratings.length === 0 ? <p className="muted">No ratings.</p> : (
          <table className="table">
            <tbody>
              {sub.ratings.map((r) => (
                <tr key={r.attributeId}><td>{r.name}</td><td className="right"><strong>{r.value ?? '—'}</strong> / {r.scale}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card card-highlight">
        <h2>Personal feedback, suggestions or complaints</h2>
        {sub.comment ? <p className="pre-wrap">{sub.comment}</p> : <p className="muted">No personal comment.</p>}
      </section>
    </>
  );
}
