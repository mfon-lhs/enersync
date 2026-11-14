// A label, an input and an error message, joined together for screen readers too.
export default function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`field ${error ? "field-invalid" : ""} ${className}`}>
      <span>{label}</span>
      {children}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
