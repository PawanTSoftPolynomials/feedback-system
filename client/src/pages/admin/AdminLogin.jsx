import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminSession, api } from '../../api.js';
import { Alert, Field } from '../../components/ui.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Admin login';
    if (adminSession.get()) navigate('/admin/feedback', { replace: true });
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/admin/login', { username, password });
      adminSession.set(res.token);
      navigate('/admin/feedback', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <h1>Admin login</h1>
        <Field label="Username" htmlFor="username">
          <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Alert>{error}</Alert>
        <button className="btn btn-primary full" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
