// THE ONE PLACE FOR COLOURS.
// Every colour in the app comes from this file. applyTheme() copies these values into CSS
// variables on the page (--void, --surface, ...), and the charts read them straight from here.
// To change the look of the whole app, change a value here and nothing else.

export const colors = {
  void: "#07090E", // page background
  surface: "#0D1322", // panels and cards
  border: "#1E293B", // lines around panels
  primary: "#3B82F6", // buttons and links
  accent: "#00F0FF", // glow, focus rings, live data
  text: "#F8FAFC", // main text
  muted: "#94A3B8", // secondary text
  operational: "#10B981", // Operational, Approved
  warning: "#F59E0B", // Maintenance Required, Pending
  danger: "#EF4444", // Decommissioned, Rejected
  transit: "#3B82F6", // In Transit
};

// How each asset status looks. The keys are the exact values the API sends.
export const ASSET_STATUS = {
  Operational: { label: "Operational", color: colors.operational },
  MaintenanceRequired: { label: "Maintenance Required", color: colors.warning },
  InTransit: { label: "In Transit", color: colors.transit },
  Decommissioned: { label: "Decommissioned", color: colors.danger },
};

// How each logistics request status looks.
export const REQUEST_STATUS = {
  Pending: { label: "Pending", color: colors.warning },
  Approved: { label: "Approved", color: colors.operational },
  Completed: { label: "Completed", color: colors.accent },
  Rejected: { label: "Rejected", color: colors.danger },
};

// How urgent a request is.
export const PRIORITY = {
  Low: { label: "Low", color: colors.muted },
  Normal: { label: "Normal", color: colors.primary },
  High: { label: "High", color: colors.warning },
  Critical: { label: "Critical", color: colors.danger },
};

// Fonts. index.html loads them from Google Fonts; the system fonts are the fallback.
export const fonts = {
  display: '"Chakra Petch", "Segoe UI", system-ui, sans-serif',
  body: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
  mono: '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
};

// Copies the palette and fonts into CSS variables. main.jsx calls this once, before the first render.
export function applyTheme(root = document.documentElement) {
  for (const [name, value] of Object.entries(colors)) {
    root.style.setProperty(`--${name}`, value);
  }
  root.style.setProperty("--font-display", fonts.display);
  root.style.setProperty("--font-body", fonts.body);
  root.style.setProperty("--font-mono", fonts.mono);
}
