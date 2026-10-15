import { CATEGORIES } from '../categories.js';

/** LMS / Course tabs with item counts, used on the admin Questions and Rating attributes pages. */
export default function CategoryTabs({ value, onChange, items = [] }) {
  return (
    <div className="tabs" role="tablist" aria-label="Section">
      {CATEGORIES.map((c) => (
        <button key={c.id} role="tab" aria-selected={value === c.id} className={value === c.id ? 'active' : ''} onClick={() => onChange(c.id)}>
          {c.label} <span className="tab-count">{items.filter((item) => item.category === c.id).length}</span>
        </button>
      ))}
    </div>
  );
}
