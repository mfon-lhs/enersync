// Numbers for the dashboard, worked out from the lists the API returns.
import { ASSET_STATUS, colors } from "../theme.js";
import { inspectionInfo } from "./format.js";

export const STATUS_ORDER = ["Operational", "MaintenanceRequired", "InTransit", "Decommissioned"];

export function fleetStats(summary, assets, requests, now = Date.now()) {
  const counts = summary?.by_status || {};
  const total = summary?.total ?? 0;
  const operational = counts.Operational || 0;
  const decommissioned = counts.Decommissioned || 0;
  const inService = total - decommissioned;

  const needsAttention = (asset) =>
    asset.status === "MaintenanceRequired" || Boolean(inspectionInfo(asset, now)?.overdue);

  const critical = assets.filter((a) => a.is_critical && a.status !== "Decommissioned");
  const criticalAtRisk = critical.filter(needsAttention);
  const overdue = assets.filter((a) => inspectionInfo(a, now)?.overdue);
  const dueSoon = assets.filter((a) => {
    const info = inspectionInfo(a, now);
    return info && !info.overdue && info.daysLeft <= 14;
  });

  const pending = requests.filter((r) => r.status === "Pending");
  const urgentPending = pending.filter((r) => r.priority === "High" || r.priority === "Critical");
  const approved = requests.filter((r) => r.status === "Approved");

  return {
    total,
    operational,
    availability: inService > 0 ? Math.round((operational / inService) * 100) : 0,
    criticalTotal: critical.length,
    criticalAtRisk,
    overdue,
    dueSoon,
    pending,
    urgentPending,
    approved,
    inTransit: counts.InTransit || 0,
  };
}

// Data for the status donut. Every status appears, even with 0 assets, so the legend never changes shape.
export function statusSlices(summary) {
  const counts = summary?.by_status || {};
  const total = summary?.total || 0;
  return STATUS_ORDER.map((status) => ({
    status,
    label: ASSET_STATUS[status].label,
    value: counts[status] || 0,
    percent: total > 0 ? Math.round(((counts[status] || 0) / total) * 100) : 0,
    fill: ASSET_STATUS[status].color,
  }));
}

// Average utilisation of the assets still in service, per location, busiest first.
export function utilisationByLocation(assets) {
  const groups = new Map();
  for (const asset of assets) {
    if (asset.status === "Decommissioned") continue;
    const group = groups.get(asset.current_location) || { sum: 0, count: 0 };
    group.sum += asset.utilization_pct;
    group.count += 1;
    groups.set(asset.current_location, group);
  }
  return [...groups.entries()]
    .map(([location, { sum, count }]) => {
      const average = Math.round(sum / count);
      return {
        location,
        average,
        assets: count,
        // red from 85%, amber from 70%, blue below
        fill: average >= 85 ? colors.danger : average >= 70 ? colors.warning : colors.primary,
      };
    })
    .sort((a, b) => b.average - a.average);
}
