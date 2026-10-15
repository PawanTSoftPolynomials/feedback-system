import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Badge, Loading, Pagination } from '../../components/ui.jsx';

function Summary() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi.get('/admin/summary').then(setSummary).catch((err) => setError(err.message));
  }, []);
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

export default function FeedbackDashboard() {
  const [query, setQuery] = useState({ page: 1, search: '', filter: 'all' });
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: query.page, limit: 20, search: query.search, filter: query.filter });
    adminApi.get(`/admin/submissions?${params}`).then(setData).catch((err) => setError(err.message));
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => setQuery((q) => (q.search === searchInput.trim() ? q : { ...q, page: 1, search: searchInput.trim() })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <>
      <h1>Feedback</h1>
      <Summary />
      <section className="card">
        <div className="toolbar">
          <input className="input" type="search" placeholder="Search name, email, mobile or college" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          <select className="input select-auto" value={query.filter} onChange={(e) => setQuery({ ...query, page: 1, filter: e.target.value })}>
            <option value="all">All submissions</option>
            <option value="winners">Winners only</option>
            <option value="non-winners">Not winners</option>
          </select>
        </div>
        <Alert>{error}</Alert>
        {!data ? <Loading /> : data.items.length === 0 ? (
          <p className="muted">No submissions found.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Student</th><th>College</th><th>Mobile</th><th>Submitted</th><th>Avg rating</th><th /></tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
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
            <p className="muted small">{data.total} submission(s)</p>
            <Pagination page={data.page} pages={data.pages} onChange={(page) => setQuery({ ...query, page })} />
          </>
        )}
      </section>
    </>
  );
}
