// Small helpers that turn API values into text a person can read.

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "5 min ago", "3 h ago", "2 d ago". Older than 30 days falls back to the date.
export function timeAgo(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return "—";
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} d ago`;
  return formatDate(value);
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCapacity(asset) {
  if (asset.capacity_value === null || asset.capacity_value === undefined) return "—";
  return `${formatNumber(asset.capacity_value, asset.capacity_value % 1 === 0 ? 0 : 2)} ${asset.capacity_unit}`;
}

// When is the next inspection due? Returns null for a decommissioned asset (it is never inspected again).
// An asset that was never inspected is due right now.
export function inspectionInfo(asset, now = Date.now()) {
  if (asset.status === "Decommissioned") return null;
  const last = toDate(asset.last_inspected_at);
  if (!last) return { dueAt: null, daysLeft: -1, overdue: true, never: true };
  const dueAt = new Date(last.getTime() + asset.inspection_interval_days * DAY_MS);
  const daysLeft = Math.ceil((dueAt.getTime() - now) / DAY_MS);
  return { dueAt, daysLeft, overdue: daysLeft < 0, never: false };
}

// A <input type="datetime-local"> wants "2026-11-14T09:30" in the person's own time zone.
export function toLocalInputValue(value) {
  const date = toDate(value);
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The reverse: the text from a datetime-local input becomes a full ISO date the API accepts.
export function fromLocalInputValue(text) {
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function fullName(person) {
  return person ? `${person.first_name} ${person.last_name}` : "—";
}

export function initials(name) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

// AssetStatus "MaintenanceRequired" -> "Maintenance Required", "ASSET_CREATED" -> "Asset created"
export function humanize(text) {
  if (!text) return "";
  const spaced = text.includes("_")
    ? text.toLowerCase().replaceAll("_", " ")
    : text.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
