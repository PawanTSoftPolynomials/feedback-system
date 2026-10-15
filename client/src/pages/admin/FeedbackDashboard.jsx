import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Loading, Pagination } from '../../components/ui.jsx';

function Summary({ refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi.get('/admin/summary').then(setSummary).catch((err) => setError(err.message));
  }, [refreshKey]);
  if (error) return <Alert>{error}</Alert>;
  if (!summary) return <Loading />;
  return (
    <>
      <div className="stats">
        <div className="stat"><span className="stat-value">{summary.totalSubmissions}</span><span className="stat-label">Submissions</span></div>
        <div className="stat"><span className="stat-value">{summary.withComments}</span><span className="stat-label">With personal comments</span></div>
        <div className="stat"><span className="stat-value">{summary.totalWinners}</span><span className="stat-label">Winners declared</span></div>
        <div className="stat"><span className="stat-value">{summary.prizesSelected}</span><span className="stat-label">Prizes selected</span></div>
      </div>
      {summary.attributes.length > 0 && (
        <section className="card">
          <h2>Rating averages</h2>
          <div className="bars">
            {summary.attributes.map((a) => (
              <div className="bar-row" key={a.attributeId}>
                <span className="bar-label">{a.name}{!a.active && <span className="muted small"> (inactive)</span>}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${a.average ? (a.average / a.scale) * 100 : 0}%` }} /></span>
                <span className="bar-value">{a.average ?? '—'} / {a.scale} <span className="muted small">({a.count})</span></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Checkbox({ checked, indeterminate = false, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="row-check" checked={checked} {...props} />;
}

export default function FeedbackDashboard() {
  const [query, setQuery] = useState({ page: 1, search: '', filter: 'all' });
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [allMatching, setAllMatching] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams({ page: query.page, limit: 20, search: query.search, filter: query.filter });
    adminApi.get(`/admin/submissions?${params}`).then(setData).catch((err) => setError(err.message));
  }, [query, refreshKey]);

  // A new search or filter starts a fresh selection, so nothing hidden gets deleted by accident.
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [query.search, query.filter]);

  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.search === searchInput.trim() ? q : { ...q, page: 1, search: searchInput.trim() })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const pageIds = data ? data.items.filter((r) => !r.isWinner).map((r) => r.id) : [];
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  const toggleRow = (id) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllMatching = async () => {
    setError('');
    try {
      const params = new URLSearchParams({ search: query.search, filter: query.filter });
      const res = await adminApi.get(`/admin/submissions/ids?${params}`);
      setSelected(new Set(res.ids));
      setAllMatching(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteSelected = async () => {
    const count = selected.size;
    if (!window.confirm(`Permanently delete ${count} submission(s) and the student details attached to them? This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      const res = await adminApi.post('/admin/submissions/delete', { ids: [...selected] });
      let text = `Deleted ${res.deleted} submission(s).`;
      if (res.skippedWinners) text += ` ${res.skippedWinners} winner submission(s) were kept.`;
      setNotice(text);
      setSelected(new Set());
      setAllMatching(false);
      setQuery((q) => ({ ...q, page: 1 }));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <h1>Feedback</h1>
      <Summary refreshKey={refreshKey} />
      <section className="card">
        <div className="toolbar">
          <input className="input" type="search" placeholder="Search name, email, mobile or college" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <select className="input select-auto" value={query.filter} onChange={(e) => setQuery({ ...query, page: 1, filter: e.target.value })}>
            <option value="all">All submissions</option>
            <option value="winners">Winners only</option>
            <option value="non-winners">Not winners</option>
          </select>
        </div>

        {selected.size > 0 && (
          <div className="selection-bar">
            <span><strong>{selected.size}</strong> selected</span>
            {allOnPageSelected && !allMatching && data && data.pages > 1 && (
              <button className="link-btn" onClick={selectAllMatching}>Select all matching submissions</button>
            )}
            <button className="link-btn" onClick={() => { setSelected(new Set()); setAllMatching(false); }}>Clear selection</button>
            <button className="btn btn-danger btn-sm" onClick={deleteSelected} disabled={deleting}>
              {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>
        )}

        <Alert type="success">{notice}</Alert>
        <Alert>{error}</Alert>
        {!data ? <Loading /> : data.items.length === 0 ? (
          <p className="muted">No submissions found.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="check-col">
                      <Checkbox
                        aria-label="Select all on this page"
                        title="Select all on this page"
                        checked={allOnPageSelected}
                        indeterminate={selectedOnPage > 0 && !allOnPageSelected}
                        disabled={pageIds.length === 0}
                        onChange={togglePage}
                      />
                    </th>
                    <th>Student</th><th>College</th><th>Mobile</th><th>Submitted</th><th>Avg rating</th><th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id} className={selected.has(row.id) ? 'row-selected' : ''}>
                      <td className="check-col">
                        <Checkbox
                          aria-label={`Select ${row.student?.fullName || 'submission'}`}
                          title={row.isWinner ? 'Winners cannot be deleted' : 'Select'}
                          checked={selected.has(row.id)}
                          disabled={row.isWinner}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                      <td>
                        <strong>{row.student?.fullName}</strong> {row.isWinner && <Badge tone="success">Winner</Badge>}
                        <div className="muted small">{row.student?.email}</div>
                      </td>
                      <td>{row.student?.college}</td>
                      <td>{row.student?.mobile}</td>
                      <td className="nowrap">{formatDate(row.submittedAt)}</td>
                      <td>{row.averagePercent === null ? '—' : `${row.averagePercent}%`} {row.hasComment && <span title="Has a personal comment">💬</span>}</td>
                      <td><Link className="btn btn-secondary btn-sm" to={`/admin/feedback/${row.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">{data.total} submission(s). Winners' submissions can't be selected for deletion.</p>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => setQuery({ ...query, page })} />
          </>
        )}
      </section>
    </>
  );
}
