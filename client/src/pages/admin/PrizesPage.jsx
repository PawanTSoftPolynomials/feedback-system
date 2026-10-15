import { useState } from 'react';
import useOrderedList from '../../components/useOrderedList.js';
import { Alert, Badge, Field, Loading } from '../../components/ui.jsx';
import OrderedList from './OrderedList.jsx';

function PrizeEditor({ initial, types, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || '');
  const [value, setValue] = useState(initial?.value || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [active, setActive] = useState(initial ? initial.active : true);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ name, type, value, description, active });
    } catch { /* error shown by parent */ } finally {
      setBusy(false);
    }
  };

  return (
    <form className="editor" onSubmit={submit}>
      <div className="grid-2">
        <Field label="Prize name" required htmlFor="p-name">
          <input id="p-name" className="input" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movie Ticket" required autoFocus />
        </Field>
        <Field label="Prize type" htmlFor="p-type" hint="Pick an existing type or type a new one.">
          <input id="p-type" className="input" list="prize-types" maxLength={60} value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Voucher" />
          <datalist id="prize-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      </div>
      <Field label="Value / details" htmlFor="p-value">
        <input id="p-value" className="input" maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Worth ₹500" />
      </Field>
      <Field label="Description" htmlFor="p-desc">
        <textarea id="p-desc" className="input" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (winners can choose it)</label>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save prize'}</button>
      </div>
    </form>
  );
}

export default function PrizesPage() {
  const list = useOrderedList('prizes');
  if (!list.items) return list.error ? <Alert>{list.error}</Alert> : <Loading />;
  const types = [...new Set(list.items.map((p) => p.type).filter(Boolean))];

  const toggle = (p) => list.save({ ...p, active: !p.active }, p.id).catch(() => {});

  return (
    <>
      <h1>Prizes</h1>
      <p className="muted">Winners see active prizes in this order and choose exactly one. A prize that has been chosen can be deactivated but not deleted.</p>
      <OrderedList
        list={list}
        noun="prize"
        renderItem={(p) => (
          <>
            <strong>{p.name}</strong> {p.value && <span className="muted">— {p.value}</span>}
            {p.description && <div className="muted small pre-wrap">{p.description}</div>}
            <div className="meta">
              {p.type && <Badge>{p.type}</Badge>}
              <Badge tone={p.active ? 'success' : 'danger'}>{p.active ? 'Active' : 'Inactive'}</Badge>
              <span className="muted small">Selected by {p.selectedCount} winner(s)</span>
              <button className="link-btn" onClick={() => toggle(p)}>{p.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </>
        )}
        renderEditor={(item, onSave, onCancel) => <PrizeEditor initial={item} types={types} onSave={onSave} onCancel={onCancel} />}
      />
    </>
  );
}
