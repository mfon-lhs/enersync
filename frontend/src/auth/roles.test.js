import { describe, expect, it } from "vitest";
import { NEXT_STATUS, ROLE_LABEL, ROLE_OPTIONS, can } from "./roles.js";

const ROLES = ["SuperAdmin", "LogisticsManager", "FieldTechnician", "Viewer"];

// Who may do what. This is the same table as section 3 of docs/design.md.
const WHO_MAY = {
  manageAssets: ["SuperAdmin", "LogisticsManager"],
  raiseRequest: ["SuperAdmin", "LogisticsManager", "FieldTechnician"],
  decideRequest: ["SuperAdmin", "LogisticsManager"],
  viewAuditLog: ["SuperAdmin"],
  manageUsers: ["SuperAdmin"],
};

describe("what each role may do", () => {
  for (const [action, allowed] of Object.entries(WHO_MAY)) {
    for (const role of ROLES) {
      const expected = allowed.includes(role);
      it(`${role} ${expected ? "may" : "may not"} ${action}`, () => {
        expect(can[action](role)).toBe(expected);
      });
    }
  }

  it("has a rule for every action in the table, and no others", () => {
    expect(Object.keys(can).sort()).toEqual(Object.keys(WHO_MAY).sort());
  });

  it("allows nothing for a missing or unknown role", () => {
    for (const action of Object.keys(WHO_MAY)) {
      expect(can[action](undefined)).toBe(false);
      expect(can[action](null)).toBe(false);
      expect(can[action]("Intern")).toBe(false);
    }
  });
});

describe("role names", () => {
  it("lists the four roles, each with a readable label", () => {
    expect(ROLE_OPTIONS.sort()).toEqual([...ROLES].sort());
    expect(ROLE_LABEL.LogisticsManager).toBe("Logistics Manager");
    expect(ROLE_LABEL.SuperAdmin).toBe("Super Admin");
  });
});

describe("request status changes", () => {
  it("lets a Pending request be approved or rejected", () => {
    expect(NEXT_STATUS.Pending).toEqual(["Approved", "Rejected"]);
  });

  it("lets an Approved request only be completed", () => {
    expect(NEXT_STATUS.Approved).toEqual(["Completed"]);
  });

  it("lets Rejected and Completed requests go nowhere", () => {
    expect(NEXT_STATUS.Rejected).toEqual([]);
    expect(NEXT_STATUS.Completed).toEqual([]);
  });
});
