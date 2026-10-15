import { useState } from 'react';
import useOrderedList from '../../components/useOrderedList.js';
import { Alert, Badge, Field, Loading } from '../../components/ui.jsx';
import OrderedList from './OrderedList.jsx';

export const QUESTION_TYPES = {
  short_text: 'Short text',
  long_text: 'Long text',
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  yes_no: 'Yes / No',
};
const isChoice = (type) => type === 'single_choice' || type === 'multiple_choice';

function QuestionEditor({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text || '');
  const [type, setType] = useState(initial?.type || 'short_text');
  const [options, setOptions] = useState((initial?.options || []).join('\n'));
  const [required, setRequired] = useState(initial ? initial.required : false);
  const [active, setActive] = useState(initial ? initial.active !== false : true);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ text, type, options: isChoice(type) ? options.split('\n').map((o) => o.trim()).filter(Boolean) : [], required, active });
    } catch { /* error shown by parent */ } finally {
      setBusy(false);
    }
  };

  return (
    <form className="editor" onSubmit={submit}>
      <Field label="Question" required htmlFor="q-text">
        <input id="q-text" className="input" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} required autoFocus />
      </Field>
      <Field label="Answer type" htmlFor="q-type">
        <select id="q-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(QUESTION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      {isChoice(type) && (
        <Field label="Options (one per line, at least 2)" required htmlFor="q-options">
          <textarea id="q-options" className="input" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} />
        </Field>
      )}
      <div className="checks">
        <label className="choice"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Mandatory</label>
        <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show on the form</label>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save question'}</button>
      </div>
    </form>
  );
}

export default function QuestionsPage() {
  const list = useOrderedList('questions');
  if (!list.items) return list.error ? <Alert>{list.error}</Alert> : <Loading />;
  return (
    <>
      <h1>Feedback questions</h1>
      <p className="muted">Students see active questions in this order. Old submissions keep their answers even if a question is edited or deleted.</p>
      <OrderedList
        list={list}
        noun="question"
        renderItem={(q) => (
          <>
            <strong>{q.text}</strong>
            <div className="meta">
              <Badge>{QUESTION_TYPES[q.type]}</Badge>
              <Badge tone={q.required ? 'warning' : 'neutral'}>{q.required ? 'Mandatory' : 'Optional'}</Badge>
              {q.active === false && <Badge tone="danger">Hidden</Badge>}
              {q.options.length > 0 && <span className="muted small">{q.options.join(' · ')}</span>}
            </div>
          </>
        )}
        renderEditor={(item, onSave, onCancel) => <QuestionEditor initial={item} onSave={onSave} onCancel={onCancel} />}
      />
    </>
  );
}
