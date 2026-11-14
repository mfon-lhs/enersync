// What each role may do. These rules MIRROR the backend (backend/app/main.py).
// They only decide what the screen shows. The server is the one that actually enforces them.

export const ROLE_LABEL = {
  SuperAdmin: "Super Admin",
  LogisticsManager: "Logistics Manager",
  FieldTechnician: "Field Technician",
  Viewer: "Viewer",
};

export const ROLE_OPTIONS = Object.keys(ROLE_LABEL);

const in_ = (role, allowed) => allowed.includes(role);

export const can = {
  manageAssets: (role) => in_(role, ["SuperAdmin", "LogisticsManager"]),
  raiseRequest: (role) => in_(role, ["SuperAdmin", "LogisticsManager", "FieldTechnician"]),
  decideRequest: (role) => in_(role, ["SuperAdmin", "LogisticsManager"]),
  viewAuditLog: (role) => role === "SuperAdmin",
  manageUsers: (role) => role === "SuperAdmin",
};

// The status changes the backend allows (ALLOWED_NEXT_STATUS in main.py).
export const NEXT_STATUS = {
  Pending: ["Approved", "Rejected"],
  Approved: ["Completed"],
  Rejected: [],
  Completed: [],
};
