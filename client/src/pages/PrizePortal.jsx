import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatDate } from '../api.js';
import { Alert, Loading } from '../components/ui.jsx';

export default function PrizePortal() {
  const { token } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justConfirmed, setJustConfirmed] = useState(false);

  useEffect(() => {
    document.title = 'Choose your prize';
    api.post('/portal/session', { token })
      .then(setView)
      .catch((err) => setError(err.message));
  }, [token]);

  const confirm = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.post('/portal/select', { token, prizeId: choice });
      setView(res);
      setJustConfirmed(true);
      setConfirming(false);
    } catch (err) {
      setSaveError(err.message);
      setConfirming(false);
      // Refresh so the page reflects the latest state (e.g. already selected, prize removed).
      api.post('/portal/session', { token }).then(setView).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (error) {
    body = <div className="card center"><h2>Link not valid</h2><p className="muted">{error}</p></div>;
  } else if (!view) {
    body = <Loading text="Verifying your link…" />;
  } else if (view.selection && !view.canSelect) {
    body = (
      <div className="card center success-card">
        <div className="success-icon" aria-hidden="true">✓</div>
        <h2>{justConfirmed ? 'Your prize is confirmed!' : 'You have already chosen your prize'}</h2>
        <p className="prize-chosen">{view.selection.prizeName}</p>
        {view.selection.prizeType && <p className="muted">{view.selection.prizeType}</p>}
        <p className="muted small">Confirmed on {formatDate(view.selection.selectedAt)}. The organiser will contact you with the next steps.</p>
      </div>
    );
  } else {
    const chosen = view.prizes.find((p) => p.id === choice);
    body = (
      <>
        <div className="card">
          <h2>Congratulations, {view.name}!</h2>
          <p>Please choose <strong>one</strong> prize from the options below. Once you confirm, your choice cannot be changed.</p>
          {view.selection && (
            <Alert type="info">Your current selection is <strong>{view.selection.prizeName}</strong>. The organiser has allowed you to change it once.</Alert>
          )}
        </div>
        {view.prizes.length === 0 ? (
          <div className="card center"><p className="muted">No prizes are available right now. Please check back later.</p></div>
        ) : (
          <div className="prize-grid" role="radiogroup" aria-label="Available prizes">
            {view.prizes.map((p) => (
              <label key={p.id} className={`prize-card${choice === p.id ? ' selected' : ''}`}>
                <input type="radio" name="prize" value={p.id} checked={choice === p.id} onChange={() => { setChoice(p.id); setConfirming(false); }} />
                {p.type && <span className="prize-type">{p.type}</span>}
                <span className="prize-name">{p.name}</span>
                {p.value && <span className="prize-value">{p.value}</span>}
                {p.description && <span className="prize-desc">{p.description}</span>}
              </label>
            ))}
          </div>
        )}
        <Alert>{saveError}</Alert>
        {chosen && !confirming && (
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setConfirming(true)}>Select {chosen.name}</button>
          </div>
        )}
        {chosen && confirming && (
          <div className="card confirm-box">
            <p>You are choosing <strong>{chosen.name}</strong>. This cannot be changed later. Continue?</p>
            <div className="actions">
              <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={saving}>Go back</button>
              <button className="btn btn-primary" onClick={confirm} disabled={saving}>{saving ? 'Confirming…' : 'Confirm my prize'}</button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="container"><h1>Prize selection</h1></div>
      </header>
      <main className="container narrow">{body}</main>
    </div>
  );
}
