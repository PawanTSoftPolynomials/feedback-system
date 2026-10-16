import { useState } from 'react';
import useOrderedList from '../../components/useOrderedList.js';
import { Alert, Badge, Field, Loading } from '../../components/ui.jsx';
import CategoryTabs from '../../components/CategoryTabs.jsx';
import { CATEGORIES, ROLES, categoryLabel, roleLabel } from '../../categories.js';
import RoleSwitch from '../../components/RoleSwitch.jsx';
import OrderedList from './OrderedList.jsx';

function AttributeEditor({ initial, defaultCategory, defaultRole, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || defaultCategory);
  const [role, setRole] = useState(initial?.role || defaultRole);
  const [description, setDescription] = useState(initial?.description || '');
  const [scale, setScale] = useState(initial?.scale || 5);
  const [required, setRequired] = useState(initial ? initial.required : true);
  const [active, setActive] = useState(initial ? initial.active !== false : true);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ name, category, role, description, scale: Number(scale), required, active });
    } catch { /* error shown by parent */ } finally {
      setBusy(false);
    }
  };

  return (
    <form className="editor" onSubmit={submit}>
      <Field label="Attribute name" required htmlFor="a-name">
        <input id="a-name" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Quality" required autoFocus />
      </Field>
      <Field label="Description (optional)" htmlFor="a-desc">
        <input id="a-desc" className="input" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Rating scale" htmlFor="a-scale" hint="Students rate from 1 up to this number.">
          <select id="a-scale" className="input" value={scale} onChange={(e) => setScale(e.target.value)}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>1 – {n}</option>)}
          </select>
        </Field>
        <Field label="Section" htmlFor="a-category" hint="Where this rating appears on the form.">
          <select id="a-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Rating for" htmlFor="a-role">
        <select id="a-role" className="input select-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.plural}</option>)}
        </select>
      </Field>
      <div className="checks">
        <label className="choice"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Mandatory</label>
        <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show on the form</label>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save attribute'}</button>
      </div>
    </form>
  );
}

export default function AttributesPage() {
  const list = useOrderedList('attributes');
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [role, setRole] = useState(ROLES[0].id);
  if (!list.items) return list.error ? <Alert>{list.error}</Alert> : <Loading />;

  const forRole = list.items.filter((a) => a.role === role);
  const visible = forRole.filter((a) => a.category === category);

  return (
    <>
      <h1>Rating attributes</h1>
      <p className="muted">Students and teachers each get their own rating attributes, grouped into LMS and Course sections. Averages appear on the Feedback dashboard.</p>
      <RoleSwitch value={role} onChange={setRole} items={list.items} />
      <CategoryTabs value={category} onChange={setCategory} items={forRole} />
      <OrderedList
        list={list}
        items={visible}
        noun={`${categoryLabel(category)} rating for ${roleLabel(role).toLowerCase()}s`}
        renderItem={(a) => (
          <>
            <strong>{a.name}</strong>
            {a.description && <div className="muted small">{a.description}</div>}
            <div className="meta">
              <Badge>Scale 1–{a.scale}</Badge>
              <Badge tone={a.required ? 'warning' : 'neutral'}>{a.required ? 'Mandatory' : 'Optional'}</Badge>
              {a.active === false && <Badge tone="danger">Hidden</Badge>}
            </div>
          </>
        )}
        renderEditor={(item, onSave, onCancel) => <AttributeEditor initial={item} defaultCategory={category} defaultRole={role} onSave={onSave} onCancel={onCancel} />}
      />
    </>
  );
}
