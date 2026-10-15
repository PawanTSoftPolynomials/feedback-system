import { useState } from 'react';
import { Alert } from '../../components/ui.jsx';

/** Shared list UI for questions, rating attributes and prizes: add, edit, delete, reorder. */
export default function OrderedList({ list, noun, renderItem, renderEditor, deleteWarning }) {
  const [editing, setEditing] = useState(null); // item id, 'new' or null

  const save = async (data) => {
    await list.save(data, editing === 'new' ? undefined : editing);
    setEditing(null);
  };

  const remove = async (item) => {
    const warning = deleteWarning ? ` ${deleteWarning}` : '';
    if (!window.confirm(`Delete this ${noun}?${warning}`)) return;
    try { await list.remove(item.id); } catch { /* error shown below */ }
  };

  return (
    <section className="card">
      <Alert>{list.error}</Alert>
      {list.items.length === 0 && editing !== 'new' && <p className="muted">No {noun}s yet.</p>}
      <ul className="item-list">
        {list.items.map((item, index) => (
          <li key={item.id} className="item">
            {editing === item.id ? (
              renderEditor(item, save, () => setEditing(null))
            ) : (
              <>
                <div className="item-body">{renderItem(item)}</div>
                <div className="item-actions">
                  <button className="btn btn-icon" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => list.move(index, -1)}>↑</button>
                  <button className="btn btn-icon" title="Move down" aria-label="Move down" disabled={index === list.items.length - 1} onClick={() => list.move(index, 1)}>↓</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(item.id)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(item)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <div className="item new-item">{renderEditor(null, save, () => setEditing(null))}</div>
      ) : (
        <button className="btn btn-primary" onClick={() => { list.setError(''); setEditing('new'); }}>Add {noun}</button>
      )}
    </section>
  );
}
