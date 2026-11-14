// The ONE place that talks to the Enersync API.
//  - adds the "Authorization: Bearer <token>" header to every call that needs it
//  - when the server answers 401, forgets the token and tells the app to show the login page
//  - turns every failure into an ApiError with a message a person can read

import { isTokenExpired } from "../lib/jwt.js";

export const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const TOKEN_KEY = "enersync.token";

// sessionStorage: the token lives only in this browser tab, and is gone when the tab closes.
// Every read and write is wrapped, because browsers can block storage (private windows, settings).
export function getToken() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token && isTokenExpired(token)) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return memoryToken;
  }
}

let memoryToken = null;

export function setToken(token) {
  memoryToken = token;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked: the token stays in memory for this page only */
  }
}

export function clearToken() {
  memoryToken = null;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to do */
  }
}

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// The app registers a function here. The client calls it when the server says the token is no good.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// FastAPI sends errors as {"detail": "text"} or {"detail": [{"loc": [...], "msg": "text"}, ...]}.
function readableDetail(body, status) {
  const detail = body && typeof body === "object" ? body.detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.filter((p) => p !== "body").join(" › ") : "";
        const message = String(item.msg || "Invalid value").replace(/^Value error, /, "");
        return field ? `${field}: ${message}` : message;
      })
      .join(". ");
  }
  if (status === 403) return "Your role is not allowed to do this.";
  if (status === 404) return "That record was not found.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return `The request failed (error ${status}).`;
}

function buildUrl(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

async function send(path, { method = "GET", body, params, auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = getToken();
    if (!token) {
      // No usable token: do not even call the server.
      onUnauthorized("Your session has ended. Please log in again.");
      throw new ApiError("Your session has ended. Please log in again.", 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Cannot reach the Enersync server at ${API_BASE}. Is the backend running?`, 0);
  }

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      // The token is expired, forged or belongs to a deactivated user.
      clearToken();
      onUnauthorized("Your session has expired. Please log in again.");
      throw new ApiError("Your session has expired. Please log in again.", 401);
    }
    throw new ApiError(readableDetail(data, response.status), response.status, data);
  }

  return { data, total: Number(response.headers.get("X-Total-Count")) || null };
}

const get = async (path, params, options) => (await send(path, { ...options, params })).data;
const post = async (path, body, options) => (await send(path, { ...options, method: "POST", body })).data;
const patch = async (path, body) => (await send(path, { method: "PATCH", body })).data;

// Gets a list together with the total the server reports in the X-Total-Count header
async function list(path, params) {
  const { data, total } = await send(path, { params });
  return { items: data, total: total ?? data.length };
}

// Gets EVERY row of a list by asking for pages of 500 (the most the server allows) until none are left.
async function listAll(path, params = {}) {
  const pageSize = 500;
  const items = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = await list(path, { ...params, limit: pageSize, skip });
    items.push(...page.items);
    if (page.items.length < pageSize || items.length >= page.total) break;
  }
  return items;
}

export const api = {
  login: (email, password) => post("/api/auth/login", { email, password }, { auth: false }),
  me: () => get("/api/auth/me"),
  health: () => get("/health", undefined, { auth: false }),

  assetSummary: () => get("/api/assets/summary"),
  listAssets: () => listAll("/api/assets"),
  createAsset: (body) => post("/api/assets", body),
  updateAsset: (id, body) => patch(`/api/assets/${id}`, body),

  listRequests: () => listAll("/api/requests"),
  createRequest: (body) => post("/api/requests", body),
  changeRequestStatus: (id, status) => patch(`/api/requests/${id}`, { status }),

  activity: (limit = 15) => get("/api/activity", { limit }),

  listUsers: () => get("/api/users"),
  createUser: (body) => post("/api/users", body),
  updateUser: (id, body) => patch(`/api/users/${id}`, body),

  // The audit log has no total. Asking for one extra row tells us whether a next page exists.
  auditLogs: async ({ tableName, userId, page = 0, pageSize = 25 }) => {
    const rows = await get("/api/audit-logs", {
      table_name: tableName,
      user_id: userId,
      limit: pageSize + 1,
      offset: page * pageSize,
    });
    return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
  },
};
