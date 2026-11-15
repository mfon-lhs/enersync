import { describe, expect, it } from "vitest";
import { colors } from "../theme.js";
import { fleetStats, statusSlices, utilisationByLocation } from "./fleet.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-15T12:00:00Z");
const daysAgo = (days) => new Date(NOW - days * DAY).toISOString();

let counter = 0;
// A healthy asset, inspected 10 days ago every 90 days. Pass changes to make it unhealthy.
function asset(changes = {}) {
  counter += 1;
  return {
    asset_id: counter,
    asset_tag: `ENS-TEST-${counter}`,
    status: "Operational",
    is_critical: false,
    current_location: "Abuja HQ",
    utilization_pct: 50,
    inspection_interval_days: 90,
    last_inspected_at: daysAgo(10),
    ...changes,
  };
}

const request = (status, priority = "Normal") => ({ status, priority });

describe("fleetStats", () => {
  const summary = {
    total: 6,
    by_status: { Operational: 3, MaintenanceRequired: 1, InTransit: 1, Decommissioned: 1 },
  };

  it("works out availability from the assets still in service", () => {
    const stats = fleetStats(summary, [], [], NOW);
    expect(stats.total).toBe(6);
    expect(stats.operational).toBe(3);
    expect(stats.availability).toBe(60); // 3 of the 5 assets that are not decommissioned
    expect(stats.inTransit).toBe(1);
  });

  it("copes with no data at all", () => {
    const stats = fleetStats(null, [], [], NOW);
    expect(stats.total).toBe(0);
    expect(stats.availability).toBe(0);
    expect(stats.criticalAtRisk).toEqual([]);
  });

  it("does not divide by zero when every asset is decommissioned", () => {
    const stats = fleetStats({ total: 2, by_status: { Decommissioned: 2 } }, [], [], NOW);
    expect(stats.availability).toBe(0);
  });

  it("counts a critical asset at risk when it needs maintenance", () => {
    const risky = asset({ is_critical: true, status: "MaintenanceRequired" });
    expect(fleetStats(summary, [risky], [], NOW).criticalAtRisk).toEqual([risky]);
  });

  it("counts a critical asset at risk when its inspection is overdue", () => {
    const risky = asset({ is_critical: true, last_inspected_at: daysAgo(200) });
    expect(fleetStats(summary, [risky], [], NOW).criticalAtRisk).toEqual([risky]);
  });

  it("does not count healthy, ordinary or decommissioned assets as critical at risk", () => {
    const healthyCritical = asset({ is_critical: true });
    const ordinaryAndOverdue = asset({ last_inspected_at: daysAgo(200) });
    const retiredCritical = asset({ is_critical: true, status: "Decommissioned", last_inspected_at: null });
    const stats = fleetStats(summary, [healthyCritical, ordinaryAndOverdue, retiredCritical], [], NOW);
    expect(stats.criticalAtRisk).toEqual([]);
    expect(stats.criticalTotal).toBe(1); // only the healthy critical one is in service
  });

  it("lists overdue assets, including ones never inspected, but not decommissioned ones", () => {
    const late = asset({ last_inspected_at: daysAgo(200) });
    const never = asset({ last_inspected_at: null });
    const fine = asset();
    const retired = asset({ status: "Decommissioned", last_inspected_at: null });
    expect(fleetStats(summary, [late, never, fine, retired], [], NOW).overdue).toEqual([late, never]);
  });

  it("lists assets due within 14 days as due soon, and not overdue ones", () => {
    const soon = asset({ last_inspected_at: daysAgo(80) }); // due in 10 days
    const later = asset({ last_inspected_at: daysAgo(10) }); // due in 80 days
    const late = asset({ last_inspected_at: daysAgo(100) }); // overdue, so not "soon"
    expect(fleetStats(summary, [soon, later, late], [], NOW).dueSoon).toEqual([soon]);
  });

  it("sorts requests into pending, urgent and approved", () => {
    const requests = [
      request("Pending", "Low"),
      request("Pending", "High"),
      request("Pending", "Critical"),
      request("Approved", "Critical"), // urgent, but no longer waiting
      request("Completed"),
      request("Rejected"),
    ];
    const stats = fleetStats(summary, [], requests, NOW);
    expect(stats.pending).toHaveLength(3);
    expect(stats.urgentPending).toHaveLength(2);
    expect(stats.approved).toHaveLength(1);
  });
});

describe("statusSlices", () => {
  it("always returns the four statuses in the same order", () => {
    const slices = statusSlices({ total: 6, by_status: { Operational: 3, MaintenanceRequired: 1, InTransit: 1, Decommissioned: 1 } });
    expect(slices.map((s) => s.status)).toEqual(["Operational", "MaintenanceRequired", "InTransit", "Decommissioned"]);
    expect(slices.map((s) => s.value)).toEqual([3, 1, 1, 1]);
    expect(slices.map((s) => s.percent)).toEqual([50, 17, 17, 17]);
    expect(slices[1].label).toBe("Maintenance Required");
    expect(slices[0].fill).toBe(colors.operational);
  });

  it("keeps all four statuses, at zero, when there is no data", () => {
    const slices = statusSlices(null);
    expect(slices).toHaveLength(4);
    expect(slices.every((s) => s.value === 0 && s.percent === 0)).toBe(true);
  });
});

describe("utilisationByLocation", () => {
  const assets = [
    asset({ current_location: "Port Harcourt Hub", utilization_pct: 90 }),
    asset({ current_location: "Port Harcourt Hub", utilization_pct: 80 }), // average 85
    asset({ current_location: "Abuja HQ", utilization_pct: 70 }),
    asset({ current_location: "Lagos Depot", utilization_pct: 69 }),
    asset({ current_location: "Warri Yard", utilization_pct: 99, status: "Decommissioned" }),
  ];

  it("averages each location, busiest first", () => {
    const rows = utilisationByLocation(assets);
    expect(rows.map((r) => r.location)).toEqual(["Port Harcourt Hub", "Abuja HQ", "Lagos Depot"]);
    expect(rows.map((r) => r.average)).toEqual([85, 70, 69]);
    expect(rows[0].assets).toBe(2);
  });

  it("leaves out decommissioned assets, and so a location that only has those", () => {
    expect(utilisationByLocation(assets).some((r) => r.location === "Warri Yard")).toBe(false);
  });

  it("colours red from 85%, amber from 70% and blue below", () => {
    const [red, amber, blue] = utilisationByLocation(assets);
    expect(red.fill).toBe(colors.danger);
    expect(amber.fill).toBe(colors.warning);
    expect(blue.fill).toBe(colors.primary);
  });

  it("returns nothing for no assets", () => {
    expect(utilisationByLocation([])).toEqual([]);
  });
});
