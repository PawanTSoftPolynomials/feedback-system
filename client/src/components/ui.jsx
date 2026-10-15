export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Loading({ text = 'Loading…' }) {
  return <p className="muted loading">{text}</p>;
}

export function Field({ label, required, error, hint, htmlFor, children }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label} {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {hint && <p className="hint">{hint}</p>}
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function RatingInput({ id, scale, value, onChange, labelledBy }) {
  return (
    <div className="rating" role="radiogroup" aria-labelledby={labelledBy} id={id}>
      {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={value === n}
          className={`rating-btn${value === n ? ' selected' : ''}`}
          onClick={() => onChange(value === n ? null : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span className="muted">Page {page} of {pages}</span>
      <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}
