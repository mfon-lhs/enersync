// Reads the expiry time out of a login token, so the app can sign the person out the moment it runs out.
// This only READS the token. The server is the one that decides whether a token is valid.

export function readTokenExpiry(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token, now = Date.now()) {
  const expiry = readTokenExpiry(token);
  // A token with no readable expiry is treated as unusable, as the server would.
  return expiry === null || expiry <= now;
}
