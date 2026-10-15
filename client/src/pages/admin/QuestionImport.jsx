import { useState } from 'react';
import { adminApi } from '../../api.js';
import { Alert } from '../../components/ui.jsx';

const EXAMPLE = `[
  { "text": "Which course did you attend?", "type": "short_text", "required": true },
  { "text": "What did you like most about the course?", "type": "long_text" },
  { "text": "How did you hear about us?", "type": "single_choice", "options": ["Friend", "Social media", "College notice", "Other"], "required": true },
  { "text": "Which topics were most useful?", "type": "multiple_choice", "options": ["HTML & CSS", "JavaScript", "React", "Node.js"] },
  { "text": "Would you recommend this course to a friend?", "type": "yes_no", "required": true }
]`;

function parse(text) {
  if (!text.trim()) return { error: '', list: null };
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && Array.isArray(data.questions) ? data.questions : null;
    if (!list) return { error: 'Expected a JSON array of questions, or an object with a "questions" array.', list: null };
    return { error: '', list };
  } catch (err) {
    return { error: `Invalid JSON: ${err.message}`, list: null };
  }
}

/** Paste or upload a JSON list of questions and add them all at once. */
export default function QuestionImport({ onImported, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = parse(text);

  const loadFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 90 * 1024) return setError('That file is too large. Import at most 200 questions at a time.');
    setError('');
    setText(await file.text());
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.post('/admin/questions/import', parsed.list);
      onImported(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Import questions from JSON</h2>
      <p className="muted small">
        Paste a JSON array or choose a <code>.json</code> file. Each question needs <code>text</code> and <code>type</code>
        {' '}(<code>short_text</code>, <code>long_text</code>, <code>single_choice</code>, <code>multiple_choice</code>, <code>yes_no</code>).
        Choice types also need <code>options</code> (at least 2). Optional: <code>required</code> (default false) and <code>active</code> (default true).
        Questions are added after the existing ones; questions whose text already exists are skipped.
      </p>
      <div className="row-actions import-tools">
        <label className="btn btn-secondary btn-sm">
          Choose .json file
          <input type="file" accept=".json,application/json" onChange={loadFile} hidden />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setText(EXAMPLE); setError(''); }}>Insert example</button>
        {text && <button type="button" className="link-btn" onClick={() => { setText(''); setError(''); }}>Clear</button>}
      </div>
      <textarea
        className="input code-input"
        rows={12}
        spellCheck={false}
        placeholder={EXAMPLE}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        aria-label="Questions JSON"
      />
      {parsed.error && <p className="field-error">{parsed.error}</p>}
      {parsed.list && !parsed.error && <p className="muted small">Ready to import {parsed.list.length} question(s).</p>}
      <Alert>{error}</Alert>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || !parsed.list || parsed.list.length === 0} onClick={submit}>
          {busy ? 'Importing…' : `Import ${parsed.list ? parsed.list.length : ''} question(s)`}
        </button>
      </div>
    </section>
  );
}
