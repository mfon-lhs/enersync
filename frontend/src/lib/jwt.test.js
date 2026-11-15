import { describe, expect, it } from "vitest";
import { isTokenExpired, readTokenExpiry } from "./jwt.js";

// Builds a token that looks like a real one. Only the middle part (the payload) matters here.
function base64url(object) {
  return btoa(JSON.stringify(object)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function makeToken(payload) {
  return `header.${base64url(payload)}.signature`;
}

const NOW = Date.parse("2026-11-15T12:00:00Z");
const inSeconds = (seconds) => Math.floor(NOW / 1000) + seconds;

describe("readTokenExpiry", () => {
  it("returns the expiry in milliseconds", () => {
    expect(readTokenExpiry(makeToken({ exp: 2000000000 }))).toBe(2000000000 * 1000);
  });

  it("reads a payload that uses the - and _ characters of base64url", () => {
    const payload = { exp: 2000000000, note: "???>>>~~~???>>>" };
    const middle = base64url(payload);
    expect(/[-_]/.test(middle)).toBe(true); // proves this test really covers those characters
    expect(readTokenExpiry(makeToken(payload))).toBe(2000000000 * 1000);
  });

  it("returns null when there is nothing to read", () => {
    expect(readTokenExpiry("not-a-token")).toBeNull();
    expect(readTokenExpiry("a.%%%.c")).toBeNull();
    expect(readTokenExpiry(makeToken({ sub: "7" }))).toBeNull(); // no exp
    expect(readTokenExpiry(makeToken({ exp: "tomorrow" }))).toBeNull(); // exp is not a number
    expect(readTokenExpiry(undefined)).toBeNull();
    expect(readTokenExpiry(null)).toBeNull();
  });
});

describe("isTokenExpired", () => {
  it("is false before the expiry time", () => {
    expect(isTokenExpired(makeToken({ exp: inSeconds(60) }), NOW)).toBe(false);
  });

  it("is true after the expiry time", () => {
    expect(isTokenExpired(makeToken({ exp: inSeconds(-1) }), NOW)).toBe(true);
  });

  it("is true at the exact moment of expiry", () => {
    expect(isTokenExpired(makeToken({ exp: inSeconds(0) }), NOW)).toBe(true);
  });

  it("treats a token with no readable expiry as expired, as the server would", () => {
    expect(isTokenExpired("garbage", NOW)).toBe(true);
    expect(isTokenExpired(makeToken({ sub: "7" }), NOW)).toBe(true);
  });
});
