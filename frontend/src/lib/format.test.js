import { describe, expect, it } from "vitest";
import {
  formatCapacity,
  formatDate,
  formatDateTime,
  formatNumber,
  fromLocalInputValue,
  fullName,
  humanize,
  initials,
  inspectionInfo,
  timeAgo,
  toLocalInputValue,
} from "./format.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-15T12:00:00Z");

describe("formatDate and formatDateTime", () => {
  it("writes a date in a readable way", () => {
    expect(formatDate("2026-03-05T12:00:00Z")).toBe("05 Mar 2026");
  });

  it("includes the year in a date with a time", () => {
    expect(formatDateTime("2026-03-05T12:00:00Z")).toContain("Mar 2026");
  });

  it("shows a dash for a missing or invalid date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("timeAgo", () => {
  const ago = (ms) => new Date(NOW - ms).toISOString();

  it("says just now for the first seconds", () => {
    expect(timeAgo(ago(10 * 1000), NOW)).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(timeAgo(ago(5 * 60 * 1000), NOW)).toBe("5 min ago");
    expect(timeAgo(ago(3 * 60 * 60 * 1000), NOW)).toBe("3 h ago");
    expect(timeAgo(ago(2 * DAY), NOW)).toBe("2 d ago");
  });

  it("falls back to the date after 30 days", () => {
    const old = ago(45 * DAY);
    expect(timeAgo(old, NOW)).toBe(formatDate(old));
  });

  it("shows a dash for a missing date", () => {
    expect(timeAgo(null, NOW)).toBe("—");
  });
});

describe("formatNumber and formatCapacity", () => {
  it("groups thousands", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("keeps the requested number of decimals", () => {
    expect(formatNumber(12.3, 2)).toBe("12.30");
  });

  it("shows a dash for nothing or for text", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber("abc")).toBe("—");
  });

  it("writes a capacity with its unit", () => {
    expect(formatCapacity({ capacity_value: 500, capacity_unit: "kVA" })).toBe("500 kVA");
    expect(formatCapacity({ capacity_value: 12.5, capacity_unit: "t" })).toBe("12.50 t");
  });

  it("shows a dash when the asset has no capacity", () => {
    expect(formatCapacity({ capacity_value: null, capacity_unit: null })).toBe("—");
  });
});

describe("inspectionInfo", () => {
  const asset = (changes) => ({
    status: "Operational",
    inspection_interval_days: 30,
    last_inspected_at: new Date(NOW - 10 * DAY).toISOString(),
    ...changes,
  });

  it("is null for a decommissioned asset, which is never inspected again", () => {
    expect(inspectionInfo(asset({ status: "Decommissioned" }), NOW)).toBeNull();
  });

  it("treats an asset that was never inspected as overdue straight away", () => {
    const info = inspectionInfo(asset({ last_inspected_at: null }), NOW);
    expect(info.overdue).toBe(true);
    expect(info.never).toBe(true);
    expect(info.dueAt).toBeNull();
  });

  it("counts the days left until the next inspection", () => {
    const info = inspectionInfo(asset({}), NOW); // inspected 10 days ago, every 30 days
    expect(info.daysLeft).toBe(20);
    expect(info.overdue).toBe(false);
    expect(info.never).toBe(false);
  });

  it("is overdue once the due date has passed", () => {
    const info = inspectionInfo(asset({ last_inspected_at: new Date(NOW - 40 * DAY).toISOString() }), NOW);
    expect(info.daysLeft).toBe(-10);
    expect(info.overdue).toBe(true);
  });

  it("is not yet overdue on the due day itself", () => {
    const info = inspectionInfo(asset({ last_inspected_at: new Date(NOW - 30 * DAY).toISOString() }), NOW);
    expect(info.daysLeft).toBe(0);
    expect(info.overdue).toBe(false);
  });
});

describe("date and time inputs", () => {
  it("turns a typed local time into an ISO date and back", () => {
    const iso = fromLocalInputValue("2026-11-14T09:30");
    expect(iso).toMatch(/^2026-11-1\dT\d\d:\d\d:00\.000Z$/);
    expect(toLocalInputValue(iso)).toBe("2026-11-14T09:30");
  });

  it("gives nothing for empty or invalid input", () => {
    expect(fromLocalInputValue("")).toBeNull();
    expect(fromLocalInputValue("nonsense")).toBeNull();
    expect(toLocalInputValue(null)).toBe("");
    expect(toLocalInputValue("nonsense")).toBe("");
  });
});

describe("names and labels", () => {
  it("joins a first and last name", () => {
    expect(fullName({ first_name: "Ada", last_name: "Obi" })).toBe("Ada Obi");
    expect(fullName(null)).toBe("—");
  });

  it("makes initials from the first two words", () => {
    expect(initials("Ada Obi")).toBe("AO");
    expect(initials("ada")).toBe("A");
    expect(initials("Ada Nkechi Obi")).toBe("AN");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });

  it("turns API words into readable ones", () => {
    expect(humanize("MaintenanceRequired")).toBe("Maintenance Required");
    expect(humanize("InTransit")).toBe("In Transit");
    expect(humanize("ASSET_CREATED")).toBe("Asset created");
    expect(humanize("REQUEST_COMPLETED")).toBe("Request completed");
    expect(humanize("")).toBe("");
    expect(humanize(null)).toBe("");
  });
});
