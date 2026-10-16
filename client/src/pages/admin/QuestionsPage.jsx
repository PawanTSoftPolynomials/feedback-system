import { useState } from 'react';
import useOrderedList from '../../components/useOrderedList.js';
import { Alert, Badge, Field, Loading } from '../../components/ui.jsx';
import CategoryTabs from '../../components/CategoryTabs.jsx';
import { CATEGORIES, ROLES, categoryLabel, roleLabel } from '../../categories.js';
import RoleSwitch from '../../components/RoleSwitch.jsx';
import OrderedList from './OrderedList.jsx';
import QuestionImport from './QuestionImport.jsx';

export const QUESTION_TYPES = {
  short_text: 'Short text',
  long_text: 'Long text',
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  yes_no: 'Yes / No',
};
const isChoice = (type) => type === 'single_choice' || type === 'multiple_choice';

function QuestionEditor({ initial, defaultCategory, defaultRole, onSave, onCancel }) {
  const [text, setText] = useState(initial?.text || '');
  const [type, setType] = useState(initial?.type || 'short_text');
  const [category, setCategory] = useState(initial?.category || defaultCategory);
  const [role, setRole] = useState(initial?.role || defaultRole);
  const [options, setOptions] = useState((initial?.options || []).join('\n'));
  const [required, setRequired] = useState(initial ? initial.required : false);
  const [active, setActive] = useState(initial ? initial.active !== false : true);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ text, type, category, role, options: isChoice(type) ? options.split('\n').map((o) => o.trim()).filter(Boolean) : [], required, active });
    } catch { /* error shown by parent */ } finally {
      setBusy(false);
    }
  };

  return (
    <form className="editor" onSubmit={submit}>
      <Field label="Question" required htmlFor="q-text">
        <input id="q-text" className="input" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} required autoFocus />
      </Field>
      <div className="grid-2">
        <Field label="Answer type" htmlFor="q-type">
          <select id="q-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(QUESTION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Section" htmlFor="q-category">
          <select id="q-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Question for" htmlFor="q-role">
        <select id="q-role" className="input select-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.plural}</option>)}
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
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [role, setRole] = useState(ROLES[0].id);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  if (!list.items) return list.error ? <Alert>{list.error}</Alert> : <Loading />;

  const forRole = list.items.filter((q) => q.role === role);
  const visible = forRole.filter((q) => q.category === category);
  const label = categoryLabel(category);

  const onImported = (res) => {
    list.setItems(res.questions);
    setImporting(false);
    setNotice(`Imported ${res.imported} question(s).${res.skipped ? ` Skipped ${res.skipped} that already existed.` : ''}`);
  };

  return (
    <>
      <div className="page-head">
        <h1>Feedback questions</h1>
        {!importing && <button className="btn btn-secondary btn-sm" onClick={() => { setNotice(''); setImporting(true); }}>Import JSON</button>}
      </div>
      <p className="muted">Students and teachers each get their own questions, grouped into LMS and Course sections and shown in this order. Old submissions keep their answers even if a question is edited or deleted.</p>
      <RoleSwitch value={role} onChange={(r) => { setRole(r); setNotice(''); }} items={list.items} />
      <CategoryTabs value={category} onChange={(c) => { setCategory(c); setNotice(''); }} items={forRole} />
      <Alert type="success">{notice}</Alert>
      {importing && <QuestionImport defaultCategory={category} defaultRole={role} onImported={onImported} onClose={() => setImporting(false)} />}
      <OrderedList
        list={list}
        items={visible}
        noun={`${label} question for ${roleLabel(role).toLowerCase()}s`}
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
        renderEditor={(item, onSave, onCancel) => <QuestionEditor initial={item} defaultCategory={category} defaultRole={role} onSave={onSave} onCancel={onCancel} />}
      />
    </>
  );
}
