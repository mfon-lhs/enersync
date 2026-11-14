import { CircleAlert, Eye, EyeOff, LoaderCircle, LogIn, Radio, ShieldCheck, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { colors } from "../theme.js";

// A decorative "site map": fixed dots for the fictional locations, with a pulse on each.
const SITES = [
  { name: "Abuja HQ", x: 52, y: 22 },
  { name: "Lagos Terminal", x: 18, y: 70 },
  { name: "Port Harcourt Hub", x: 50, y: 76 },
  { name: "Warri Depot", x: 34, y: 64 },
  { name: "Bonny Island", x: 62, y: 84 },
  { name: "Obagi Field", x: 56, y: 60 },
];

function SiteMap() {
  return (
    <svg className="site-map" viewBox="0 0 100 100" role="img" aria-label="Illustration of connected operating sites">
      <defs>
        <radialGradient id="map-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="52" r="46" fill="url(#map-glow)" />
      {[18, 30, 42].map((r) => (
        <circle key={r} cx="50" cy="52" r={r} fill="none" stroke={colors.border} strokeWidth="0.3" strokeDasharray="1 1.5" />
      ))}
      {SITES.slice(1).map((site) => (
        <line key={site.name} x1={SITES[0].x} y1={SITES[0].y} x2={site.x} y2={site.y} stroke={colors.primary} strokeOpacity="0.45" strokeWidth="0.25" />
      ))}
      {SITES.map((site, index) => (
        <g key={site.name}>
          <circle className="site-pulse" cx={site.x} cy={site.y} r="1.6" fill="none" stroke={colors.accent} strokeWidth="0.3" style={{ animationDelay: `${index * 0.5}s` }} />
          <circle cx={site.x} cy={site.y} r="1" fill={colors.accent} />
          <text x={site.x + 2.4} y={site.y + 0.9} fontSize="2.6" fill={colors.muted} fontFamily="var(--font-mono)">
            {site.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function LoginPage() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (problem) {
      setError(
        problem.status === 401
          ? "Wrong email or password."
          : problem.message || "Could not log in. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-hero" aria-hidden="false">
        <div className="login-brand">
          <span className="brand-mark">
            <Zap size={22} />
          </span>
          <strong>ENERSYNC</strong>
        </div>
        <h1>Every asset. Every move. One command center.</h1>
        <p className="muted">
          Track equipment across sites, approve logistics in real time and keep a tamper-proof record of every change.
        </p>
        <SiteMap />
        <ul className="login-points">
          <li>
            <Radio size={16} /> Live fleet status and utilisation
          </li>
          <li>
            <ShieldCheck size={16} /> Role-based access and a full audit trail
          </li>
        </ul>
      </section>

      <section className="login-side">
        <form className="login-card panel" onSubmit={submit} noValidate>
          <h2>Sign in</h2>
          <p className="muted">Use your Enersync account to continue.</p>

          {notice && !error && (
            <div className="alert alert-warn" role="status">
              <CircleAlert size={16} /> {notice}
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert">
              <CircleAlert size={16} /> {error}
            </div>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@enersync.corp"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <div className="input-with-button">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={busy || !email || !password}>
            {busy ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="disclaimer">
            Enersync is an independent portfolio project and is not affiliated with any energy company. All data is
            fictional.
          </p>
        </form>
      </section>
    </div>
  );
}
