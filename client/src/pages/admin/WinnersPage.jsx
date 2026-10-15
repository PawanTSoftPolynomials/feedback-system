import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Loading } from '../../components/ui.jsx';

export function EmailStatus({ status, error }) {
  if (status === 'sent') return <Badge tone="success">Email sent</Badge>;
  if (status === 'sending') return <Badge tone="warning">Sending…</Badge>;
  return (
    <span title={error || ''}>
      <Badge tone="danger">Email failed</Badge>
      {error && <span className="field-error small block">{error}</span>}
    </span>
  );
}

export default function WinnersPage() {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setRows(null);
    adminApi.get(`/admin/winners?filter=${filter}`).then(setRows).catch((err) => setError(err.message));
  }, [filter]);

  const act = async (id, fn) => {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const replaceRow = (row) => setRows((list) => list.map((r) => (r.id === row.id ? row : r)));

  const resend = (w) => act(w.id, async () => {
    if (!window.confirm(`Send a new prize link to ${w.student?.email}? Any previous link for this winner will stop working.`)) return;
    const row = await adminApi.post(`/admin/winners/${w.id}/resend`);
    replaceRow(row);
    if (row.emailStatus === 'sent') setNotice(`A new prize link was emailed to ${row.student?.email}.`);
    else setError(`The email could not be sent: ${row.emailError}`);
  });

  const toggleChange = (w) => act(w.id, async () => {
    replaceRow(await adminApi.put(`/admin/winners/${w.id}/allow-change`, { allowChange: !w.allowChange }));
  });

  const revoke = (w) => act(w.id, async () => {
    if (!window.confirm(`Remove ${w.student?.fullName} from the winners? Their prize link will stop working.`)) return;
    await adminApi.del(`/admin/winners/${w.id}`);
    setRows((list) => list.filter((r) => r.id !== w.id));
  });

  return (
    <>
      <h1>Winners</h1>
      <p className="muted">Declare winners from a submission on the <Link to="/admin/feedback">Feedback</Link> page. Each winner receives a personal prize-selection link by email.</p>
      <div className="tabs" role="tablist">
        {[['all', 'All'], ['pending', 'Not selected yet'], ['selected', 'Prize selected']].map(([value, label]) => (
          <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <Alert type="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <section className="card">
        {!rows ? <Loading /> : rows.length === 0 ? <p className="muted">No winners in this list.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Winner</th><th>Declared</th><th>Email</th><th>Prize</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link to={`/admin/feedback/${w.submissionId}`}><strong>{w.student?.fullName}</strong></Link>
                      <div className="muted small">{w.student?.email} · {w.student?.mobile}</div>
                      <div className="muted small">{w.student?.college}</div>
                    </td>
                    <td className="nowrap">{formatDate(w.declaredAt)}</td>
                    <td>
                      <EmailStatus status={w.emailStatus} error={w.emailError} />
                      {w.emailSentAt && <div className="muted small">{formatDate(w.emailSentAt)}</div>}
                    </td>
                    <td>
                      {w.selection ? (
                        <>
                          <strong>{w.selection.prizeName}</strong>
                          <div className="muted small">{formatDate(w.selection.selectedAt)}</div>
                          {w.selection.history.length > 0 && <div className="muted small">Changed from {w.selection.history.map((h) => h.prizeName).join(', ')}</div>}
                          {w.allowChange && <Badge tone="warning">Change allowed</Badge>}
                        </>
                      ) : <Badge>Not selected</Badge>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" disabled={busyId === w.id} onClick={() => resend(w)}>
                          {w.emailStatus === 'failed' ? 'Retry email' : 'Resend link'}
                        </button>
                        {w.selection && (
                          <button className="btn btn-secondary btn-sm" disabled={busyId === w.id} onClick={() => toggleChange(w)}>
                            {w.allowChange ? 'Lock selection' : 'Allow change'}
                          </button>
                        )}
                        {!w.selection && (
                          <button className="btn btn-danger btn-sm" disabled={busyId === w.id} onClick={() => revoke(w)}>Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
