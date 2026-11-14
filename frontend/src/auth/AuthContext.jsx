import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from "../api/client.js";
import { readTokenExpiry } from "../lib/jwt.js";

const AuthContext = createContext(null);

// setTimeout cannot wait longer than about 24 days
const MAX_TIMER_MS = 2_000_000_000;

export function AuthProvider({ children }) {
  // "checking": looking for a saved login. "anonymous": logged out. "authenticated": logged in.
  const [status, setStatus] = useState(() => (getToken() ? "checking" : "anonymous"));
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState("");
  const expiryTimer = useRef(null);

  const endSession = useCallback((message = "") => {
    clearToken();
    clearTimeout(expiryTimer.current);
    setUser(null);
    setStatus("anonymous");
    setNotice(message);
  }, []);

  // When any API call gets a 401, the client calls this, and the login page appears.
  useEffect(() => {
    setUnauthorizedHandler((message) => endSession(message));
    return () => setUnauthorizedHandler(() => {});
  }, [endSession]);

  // Sign out at the exact moment the token expires, instead of waiting for a failed call.
  const watchExpiry = useCallback(
    (token) => {
      clearTimeout(expiryTimer.current);
      const expiry = readTokenExpiry(token);
      if (!expiry) return;
      const wait = Math.min(Math.max(expiry - Date.now(), 0), MAX_TIMER_MS);
      expiryTimer.current = setTimeout(() => endSession("Your session expired. Please log in again."), wait);
    },
    [endSession],
  );

  // On first load: if a token was saved in this tab, ask the server who it belongs to.
  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus("authenticated");
        watchExpiry(token);
      })
      .catch((error) => {
        if (cancelled) return;
        // A 401 already ended the session. Any other failure (server down) also returns to login.
        if (error.status !== 401) endSession("Could not restore your session. Please log in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [endSession, watchExpiry]);

  const login = useCallback(
    async (email, password) => {
      const { access_token: token } = await api.login(email.trim(), password);
      setToken(token);
      try {
        const me = await api.me();
        setUser(me);
        setStatus("authenticated");
        setNotice("");
        watchExpiry(token);
      } catch (error) {
        clearToken();
        throw error;
      }
    },
    [watchExpiry],
  );

  const logout = useCallback(() => endSession(""), [endSession]);

  const value = useMemo(
    () => ({ status, user, role: user?.role ?? null, notice, login, logout }),
    [status, user, notice, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
