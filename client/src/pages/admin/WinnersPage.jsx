import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Checkbox, Loading } from '../../components/ui.jsx';
import { roleLabel } from '../../categories.js';

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

/** Confirmation text for deleting winners; warns when prize choices will be removed too. */
export function deleteWinnersMessage(winners) {
  const withPrize = winners.filter((w) => w.selection).length;
  const who = winners.length === 1 ? `${winners[0].student?.fullName || 'this winner'}` : `${winners.length} winners`;
  let text = `Permanently delete ${who}? Their prize links will stop working.`;
  if (withPrize) text += `\n\n${withPrize === 1 && winners.length === 1 ? 'This winner has' : `${withPrize} of them have`} already chosen a prize. That prize choice will also be deleted.`;
  return `${text}\n\nTheir feedback submission (if it still exists) is not deleted. This cannot be undone.`;
}

export default function WinnersPage() {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    setRows(null);
    setSelected(new Set());
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

  const removeRows = (ids) => {
    setRows((list) => list.filter((r) => !ids.includes(r.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
  };

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

  const deleteOne = (w) => act(w.id, async () => {
    if (!window.confirm(deleteWinnersMessage([w]))) return;
    await adminApi.del(`/admin/winners/${w.id}`);
    removeRows([w.id]);
    setNotice(`${w.student?.fullName || 'Winner'} was deleted.`);
  });

  const deleteSelected = () => act('bulk', async () => {
    const chosen = rows.filter((r) => selected.has(r.id));
    if (!window.confirm(deleteWinnersMessage(chosen))) return;
    const res = await adminApi.post('/admin/winners/delete', { ids: chosen.map((r) => r.id) });
    removeRows(chosen.map((r) => r.id));
    setNotice(`Deleted ${res.deleted} winner(s)${res.selectionsDeleted ? ` and ${res.selectionsDeleted} prize choice(s)` : ''}.`);
  });

  const allIds = rows ? rows.map((r) => r.id) : [];
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));
  const toggleRow = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <h1>Winners</h1>
      <p className="muted">Declare winners from a submission on the <Link to="/admin/feedback">Feedback</Link> page. Each winner is stored here with their own copy of their details and feedback, and receives a personal prize-selection link by email.</p>
      <div className="tabs" role="tablist">
        {[['all', 'All'], ['pending', 'Not selected yet'], ['selected', 'Prize selected']].map(([value, label]) => (
          <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <Alert type="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <section className="card">
        {selected.size > 0 && (
          <div className="selection-bar">
            <span><strong>{selected.size}</strong> selected</span>
            <button className="link-btn" onClick={() => setSelected(new Set())}>Clear selection</button>
            <button className="btn btn-danger btn-sm" onClick={deleteSelected} disabled={busyId === 'bulk'}>
              {busyId === 'bulk' ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>
        )}
        {!rows ? <Loading /> : rows.length === 0 ? <p className="muted">No winners in this list.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="check-col">
                    <Checkbox
                      aria-label="Select all winners"
                      title="Select all"
                      checked={allSelected}
                      indeterminate={selected.size > 0 && !allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>Winner</th><th>Declared</th><th>Email</th><th>Prize</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className={selected.has(w.id) ? 'row-selected' : ''}>
                    <td className="check-col">
                      <Checkbox aria-label={`Select ${w.student?.fullName || 'winner'}`} checked={selected.has(w.id)} onChange={() => toggleRow(w.id)} />
                    </td>
                    <td>
                      <Link to={`/admin/winners/${w.id}`}><strong>{w.student?.fullName || 'Unknown'}</strong></Link> <Badge tone={w.student?.role === 'teacher' ? 'info' : 'neutral'}>{roleLabel(w.student?.role)}</Badge>
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
                        <Link className="btn btn-secondary btn-sm" to={`/admin/winners/${w.id}`}>View</Link>
                        <button className="btn btn-secondary btn-sm" disabled={busyId === w.id} onClick={() => resend(w)}>
                          {w.emailStatus === 'failed' ? 'Retry email' : 'Resend link'}
                        </button>
                        {w.selection && (
                          <button className="btn btn-secondary btn-sm" disabled={busyId === w.id} onClick={() => toggleChange(w)}>
                            {w.allowChange ? 'Lock selection' : 'Allow change'}
                          </button>
                        )}
                        <button className="btn btn-danger btn-sm" disabled={busyId === w.id} onClick={() => deleteOne(w)}>Delete</button>
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
