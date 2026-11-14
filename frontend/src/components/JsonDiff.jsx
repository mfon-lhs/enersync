import { useMemo, useState } from "react";

// Shows what an audit row changed: red lines for the old values, green lines for the new ones.
function show(value) {
  return value === undefined ? "" : JSON.stringify(value);
}

export function diffValues(oldValue, newValue) {
  const before = oldValue || {};
  const after = newValue || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.map((key) => {
    const inBefore = key in before;
    const inAfter = key in after;
    let kind = "same";
    if (!inBefore) kind = "added";
    else if (!inAfter) kind = "removed";
    else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) kind = "changed";
    return { key, kind, before: before[key], after: after[key] };
  });
}

export default function JsonDiff({ oldValue, newValue }) {
  const [showSame, setShowSame] = useState(false);
  const [raw, setRaw] = useState(false);
  const entries = useMemo(() => diffValues(oldValue, newValue), [oldValue, newValue]);
  const changed = entries.filter((entry) => entry.kind !== "same");
  const shown = showSame ? entries : changed;

  return (
    <div className="diff">
      <div className="diff-tools">
        <span className="muted">
          {changed.length} field{changed.length === 1 ? "" : "s"} {oldValue ? "changed" : "recorded"}
        </span>
        <label className="check check-inline">
          <input type="checkbox" checked={showSame} onChange={(event) => setShowSame(event.target.checked)} />
          <span>Show unchanged</span>
        </label>
        <label className="check check-inline">
          <input type="checkbox" checked={raw} onChange={(event) => setRaw(event.target.checked)} />
          <span>Raw JSON</span>
        </label>
      </div>

      {raw ? (
        <div className="diff-raw">
          <div>
            <h4>Before</h4>
            <pre>{oldValue ? JSON.stringify(oldValue, null, 2) : "—"}</pre>
          </div>
          <div>
            <h4>After</h4>
            <pre>{newValue ? JSON.stringify(newValue, null, 2) : "—"}</pre>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing changed in the stored fields.</p>
      ) : (
        <div className="diff-lines" role="table" aria-label="Changed fields">
          {shown.map((entry) => (
            <div key={entry.key} className={`diff-entry diff-${entry.kind}`} role="rowgroup">
              <span className="diff-key mono">{entry.key}</span>
              <div className="diff-values">
                {(entry.kind === "removed" || entry.kind === "changed") && (
                  <div className="diff-line diff-old" role="row">
                    <span aria-label="before">−</span>
                    <code>{show(entry.before)}</code>
                  </div>
                )}
                {(entry.kind === "added" || entry.kind === "changed") && (
                  <div className="diff-line diff-new" role="row">
                    <span aria-label="after">+</span>
                    <code>{show(entry.after)}</code>
                  </div>
                )}
                {entry.kind === "same" && (
                  <div className="diff-line" role="row">
                    <span aria-hidden="true">=</span>
                    <code>{show(entry.after)}</code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
