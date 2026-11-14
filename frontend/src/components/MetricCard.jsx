import { useCountUp } from "../lib/hooks.js";
import { formatNumber } from "../lib/format.js";

// One big live figure on the dashboard.
export default function MetricCard({ icon: Icon, label, value, suffix = "", hint, color, loading }) {
  const shown = useCountUp(typeof value === "number" ? value : 0);
  return (
    <article className="panel metric" style={{ "--tone": color }}>
      <div className="metric-top">
        <span className="metric-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value" aria-live="polite">
        {loading || typeof value !== "number" ? (
          <span className="skeleton skeleton-number" aria-label="Loading" />
        ) : (
          <>
            {formatNumber(Math.round(shown))}
            {suffix && <span className="metric-suffix">{suffix}</span>}
          </>
        )}
      </div>
      {hint && <div className="metric-hint">{hint}</div>}
    </article>
  );
}
