import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE, ApiError, api, clearToken, getToken, setToken, setUnauthorizedHandler } from "./client.js";

// ---- helpers: a pretend server, and tokens that look real ----

function base64url(object) {
  return btoa(JSON.stringify(object)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
// A token that expires in `seconds` from now (use a negative number for an expired one)
function tokenExpiringIn(seconds) {
  return `header.${base64url({ exp: Math.floor(Date.now() / 1000) + seconds })}.signature`;
}

// What the server sent back. `body` can be an object, or null for "no readable body".
function reply(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    json: async () => {
      if (body === null) throw new Error("no body");
      return body;
    },
  };
}

let fetchMock;
let onUnauthorized;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  onUnauthorized = vi.fn();
  setUnauthorizedHandler(onUnauthorized);
  clearToken();
});

afterEach(() => {
  clearToken();
  setUnauthorizedHandler(() => {});
  vi.unstubAllGlobals();
});

const lastCall = () => {
  const [url, options] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: new URL(url), options };
};

// ---- the token ----

describe("the stored token", () => {
  it("is kept in sessionStorage and read back", () => {
    const token = tokenExpiringIn(600);
    setToken(token);
    expect(sessionStorage.getItem("enersync.token")).toBe(token);
    expect(getToken()).toBe(token);
  });

  it("is forgotten by clearToken", () => {
    setToken(tokenExpiringIn(600));
    clearToken();
    expect(getToken()).toBeNull();
    expect(sessionStorage.getItem("enersync.token")).toBeNull();
  });

  it("is dropped when it has expired", () => {
    setToken(tokenExpiringIn(-60));
    expect(getToken()).toBeNull();
    expect(sessionStorage.getItem("enersync.token")).toBeNull();
  });

  it("stays in memory when the browser blocks storage", () => {
    const blocked = () => {
      throw new Error("storage is blocked");
    };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    const token = tokenExpiringIn(600);
    setToken(token);
    expect(getToken()).toBe(token);
  });
});

// ---- what gets sent ----

describe("sending requests", () => {
  it("logs in without a token and sends the credentials as JSON", async () => {
    fetchMock.mockResolvedValue(reply({ access_token: "abc", token_type: "bearer" }));

    const result = await api.login("ada@enersync.corp", "secret-password");

    expect(result.access_token).toBe("abc");
    const { url, options } = lastCall();
    expect(url.pathname).toBe("/api/auth/login");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ email: "ada@enersync.corp", password: "secret-password" });
  });

  it("adds the Bearer token to every other call", async () => {
    const token = tokenExpiringIn(600);
    setToken(token);
    fetchMock.mockResolvedValue(reply({ email: "ada@enersync.corp" }));

    await api.me();

    expect(lastCall().options.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it("does not add a token to the health check", async () => {
    fetchMock.mockResolvedValue(reply({ status: "ok" }));
    await api.health();
    expect(lastCall().options.headers.Authorization).toBeUndefined();
  });

  it("sends PATCH with a JSON body to change a request status", async () => {
    setToken(tokenExpiringIn(600));
    fetchMock.mockResolvedValue(reply({ request_id: 7, status: "Approved" }));

    await api.changeRequestStatus(7, "Approved");

    const { url, options } = lastCall();
    expect(url.pathname).toBe("/api/requests/7");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ status: "Approved" });
  });

  it("puts query values in the address", async () => {
    setToken(tokenExpiringIn(600));
    fetchMock.mockResolvedValue(reply([]));

    await api.activity(12);

    expect(lastCall().url.searchParams.get("limit")).toBe("12");
  });

  it("returns null for an answer with no content (204)", async () => {
    setToken(tokenExpiringIn(600));
    fetchMock.mockResolvedValue(reply(null, { status: 204 }));

    await expect(api.updateAsset(1, { name: "x" })).resolves.toBeNull();
  });
});

// ---- when there is no usable token ----

describe("a missing or refused token", () => {
  it("does not even call the server when there is no token", async () => {
    await expect(api.me()).rejects.toMatchObject({ name: "ApiError", status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("forgets the token and logs out when the server answers 401", async () => {
    setToken(tokenExpiringIn(600));
    fetchMock.mockResolvedValue(reply({ detail: "Invalid token" }, { status: 401 }));

    await expect(api.me()).rejects.toMatchObject({ status: 401, message: "Your session has expired. Please log in again." });

    expect(getToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledWith("Your session has expired. Please log in again.");
  });

  it("shows a wrong password as an error on the form, not as an expired session", async () => {
    fetchMock.mockResolvedValue(reply({ detail: "Wrong email or password." }, { status: 401 }));

    await expect(api.login("ada@enersync.corp", "nope")).rejects.toMatchObject({
      status: 401,
      message: "Wrong email or password.",
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

// ---- readable errors ----

describe("error messages", () => {
  beforeEach(() => setToken(tokenExpiringIn(600)));

  it("uses the server's own message when it sends text", async () => {
    fetchMock.mockResolvedValue(reply({ detail: "Asset tag already exists" }, { status: 409 }));
    const problem = await api.createAsset({}).catch((error) => error);
    expect(problem).toBeInstanceOf(ApiError);
    expect(problem.status).toBe(409);
    expect(problem.message).toBe("Asset tag already exists");
  });

  it("names the field for validation errors and drops the technical prefix", async () => {
    fetchMock.mockResolvedValue(
      reply(
        {
          detail: [
            { loc: ["body", "asset_tag"], msg: "Value error, Asset tag must start with ENS-" },
            { loc: ["body", "utilization_pct"], msg: "Input should be less than or equal to 100" },
          ],
        },
        { status: 422 },
      ),
    );
    const problem = await api.createAsset({}).catch((error) => error);
    expect(problem.message).toBe(
      "asset_tag: Asset tag must start with ENS-. utilization_pct: Input should be less than or equal to 100",
    );
  });

  it("writes a friendly message when the server sends no text", async () => {
    const messageFor = async (status) => {
      fetchMock.mockResolvedValue(reply(null, { status }));
      return (await api.assetSummary().catch((error) => error)).message;
    };
    expect(await messageFor(403)).toBe("Your role is not allowed to do this.");
    expect(await messageFor(404)).toBe("That record was not found.");
    expect(await messageFor(500)).toBe("The server had a problem. Please try again.");
    expect(await messageFor(418)).toBe("The request failed (error 418).");
  });

  it("says the server cannot be reached when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const problem = await api.assetSummary().catch((error) => error);
    expect(problem.status).toBe(0);
    expect(problem.message).toContain("Cannot reach the Enersync server");
    expect(problem.message).toContain(API_BASE);
  });
});

// ---- lists and paging ----

describe("loading whole lists", () => {
  beforeEach(() => setToken(tokenExpiringIn(600)));

  const rows = (count, from = 0) => Array.from({ length: count }, (_, i) => ({ asset_id: from + i }));

  it("asks for pages of 500 until it has every row", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(rows(500), { headers: { "X-Total-Count": "650" } }))
      .mockResolvedValueOnce(reply(rows(150, 500), { headers: { "X-Total-Count": "650" } }));

    const assets = await api.listAssets();

    expect(assets).toHaveLength(650);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(fetchMock.mock.calls[0][0]).searchParams;
    const second = new URL(fetchMock.mock.calls[1][0]).searchParams;
    expect([first.get("limit"), first.get("skip")]).toEqual(["500", "0"]);
    expect([second.get("limit"), second.get("skip")]).toEqual(["500", "500"]);
  });

  it("stops after one call when everything fits on the first page", async () => {
    fetchMock.mockResolvedValue(reply(rows(3), { headers: { "X-Total-Count": "3" } }));
    expect(await api.listRequests()).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops when the reported total is reached, even if the page was full", async () => {
    fetchMock.mockResolvedValue(reply(rows(500), { headers: { "X-Total-Count": "500" } }));
    expect(await api.listAssets()).toHaveLength(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("audit log paging", () => {
  beforeEach(() => setToken(tokenExpiringIn(600)));

  it("asks for one extra row to learn whether a next page exists", async () => {
    fetchMock.mockResolvedValue(reply(Array.from({ length: 26 }, (_, i) => ({ log_id: i }))));

    const result = await api.auditLogs({ tableName: "assets", page: 2 });

    const params = lastCall().url.searchParams;
    expect(params.get("limit")).toBe("26");
    expect(params.get("offset")).toBe("50");
    expect(params.get("table_name")).toBe("assets");
    expect(params.has("user_id")).toBe(false);
    expect(result.rows).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });

  it("reports no next page when the last page is not full", async () => {
    fetchMock.mockResolvedValue(reply([{ log_id: 1 }, { log_id: 2 }]));
    const result = await api.auditLogs({});
    expect(result.rows).toHaveLength(2);
    expect(result.hasMore).toBe(false);
  });
});
