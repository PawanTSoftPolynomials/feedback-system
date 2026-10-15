import { useEffect, useState } from 'react';
import { adminApi } from '../../api.js';
import { Alert, Field, Loading } from '../../components/ui.jsx';

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.get('/admin/config').then(setConfig).catch((err) => setError(err.message));
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
        <h2>Data backup</h2>
        <p className="muted">Download a single JSON file containing all stored data (students, questions, ratings, submissions, prizes, winners and selections). Keep it somewhere safe; it contains personal information.</p>
        <button className="btn btn-secondary" onClick={downloadBackup}>Download backup</button>
      </section>
    </>
  );
}
