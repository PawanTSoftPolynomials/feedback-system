import { ROLES } from '../categories.js';

/** Students / Teachers switch used on the admin Questions and Rating attributes pages. */
export default function RoleSwitch({ value, onChange, items = [] }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Questions for">
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={value === r.id}
          className={value === r.id ? 'active' : ''}
          onClick={() => onChange(r.id)}
        >
          For {r.plural} <span className="tab-count">{items.filter((item) => item.role === r.id).length}</span>
        </button>
      ))}
    </div>
  );
}
