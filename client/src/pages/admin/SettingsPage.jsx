import { useEffect, useState } from 'react';
import { adminApi, formatDate } from '../../api.js';
import { Alert, Field, Loading } from '../../components/ui.jsx';

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState(null);

  useEffect(() => {
    adminApi.get('/admin/config').then(setConfig).catch((err) => setError(err.message));
    adminApi.get('/admin/sync-status').then(setSync).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setConfig(await adminApi.put('/admin/config', config));
      setNotice('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async () => {
    setError('');
    try {
      const res = await adminApi.download('/admin/backup');
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'feedback-backup.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!config) return error ? <Alert>{error}</Alert> : <Loading />;

  return (
    <>
      <h1>Settings</h1>
      <Alert type="success">{notice}</Alert>
      <Alert>{error}</Alert>
      <form className="card" onSubmit={save}>
        <h2>Feedback form</h2>
        <Field label="Form title" required htmlFor="s-title">
          <input id="s-title" className="input" maxLength={120} value={config.formTitle} onChange={(e) => setConfig({ ...config, formTitle: e.target.value })} required />
        </Field>
        <Field label="Introduction shown to students" htmlFor="s-desc">
          <textarea id="s-desc" className="input" rows={3} maxLength={1000} value={config.formDescription} onChange={(e) => setConfig({ ...config, formDescription: e.target.value })} />
        </Field>
        <label className="choice">
          <input type="checkbox" checked={config.formOpen} onChange={(e) => setConfig({ ...config, formOpen: e.target.checked })} />
          Form is open for submissions
        </label>
        <div className="actions">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>
      <section className="card">
        <h2>Data storage</h2>
        {!sync ? <p className="muted">Checking…</p> : sync.storage === 'postgres' ? (
          <p>All data is stored in the <strong>PostgreSQL database</strong>. It is kept across restarts and redeploys. Use the backup below for extra copies.</p>
        ) : sync.enabled ? (
          <>
            <p>
              Every change is saved to the private GitHub repository <strong>{sync.repo}</strong>
              {sync.folder ? <> (folder <code>{sync.folder}</code>)</> : null} and restored from there when the server restarts.
            </p>
            <p className="muted small">
              Last saved: {sync.lastSyncedAt ? formatDate(sync.lastSyncedAt) : 'no changes since the server started'}
              {sync.pending > 0 && <> · <strong>{sync.pending} file(s) waiting to upload</strong></>}
            </p>
            {sync.lastError && <Alert>Last upload problem: {sync.lastError}. It is retried automatically.</Alert>}
          </>
        ) : (
          <p className="muted">Not configured. Data is stored only on this server's disk. On hosting without a persistent disk (such as Render's free plan) it is lost on every restart; set <code>GITHUB_SYNC_REPO</code> and <code>GITHUB_SYNC_TOKEN</code> to turn on the GitHub backup.</p>
        )}
      </section>
      <section className="card">
        <h2>Data backup</h2>
        <p className="muted">Download a single JSON file containing all stored data (students, questions, ratings, submissions, prizes, winners and selections). Keep it somewhere safe; it contains personal information.</p>
        <button className="btn btn-secondary" onClick={downloadBackup}>Download backup</button>
      </section>
    </>
  );
}
