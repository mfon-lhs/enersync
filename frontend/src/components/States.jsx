import { Inbox, RefreshCw, ServerCrash } from "lucide-react";

export function EmptyState({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="state">
      <Icon size={34} aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <ServerCrash size={34} aria-hidden="true" />
      <h3>Could not load this</h3>
      <p className="muted">{error?.message || "Something went wrong."}</p>
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          <RefreshCw size={16} /> Try again
        </button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 6 }) {
  return (
    <div className="loading-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
