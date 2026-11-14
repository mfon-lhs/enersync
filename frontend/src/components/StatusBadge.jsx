import { ASSET_STATUS, PRIORITY, REQUEST_STATUS, colors } from "../theme.js";
import { humanize } from "../lib/format.js";

// A small coloured label. The colour comes from theme.js, and the dot makes it readable without colour too.
function Badge({ label, color, title }) {
  return (
    <span className="badge" style={{ "--badge": color }} title={title}>
      <span className="badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function AssetStatusBadge({ status }) {
  const info = ASSET_STATUS[status] || { label: humanize(status), color: colors.muted };
  return <Badge label={info.label} color={info.color} />;
}

export function RequestStatusBadge({ status }) {
  const info = REQUEST_STATUS[status] || { label: humanize(status), color: colors.muted };
  return <Badge label={info.label} color={info.color} />;
}

export function PriorityBadge({ priority }) {
  const info = PRIORITY[priority] || { label: humanize(priority), color: colors.muted };
  return <Badge label={info.label} color={info.color} title={`${info.label} priority`} />;
}

// The audit log's action names, like ASSET_CREATED or REQUEST_REJECTED
export function ActionBadge({ action }) {
  const end = action.split("_").pop();
  const color =
    { CREATED: colors.operational, APPROVED: colors.operational, UPDATED: colors.primary, COMPLETED: colors.accent, REJECTED: colors.danger }[end] ||
    colors.muted;
  return <Badge label={humanize(action)} color={color} />;
}
