import {
  Activity,
  Cpu,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api } from "../api/client.js";
import { ROLE_LABEL, can } from "../auth/roles.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { initials } from "../lib/format.js";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard, end: true, show: () => true },
  { to: "/assets", label: "Asset Fleet", icon: Cpu, show: () => true },
  { to: "/requests", label: "Logistics", icon: Truck, show: () => true },
  { to: "/audit", label: "Audit Log", icon: ScrollText, show: (role) => can.viewAuditLog(role) },
  { to: "/users", label: "Users", icon: Users, show: (role) => can.manageUsers(role) },
];

const TITLES = {
  "/": "Command Center",
  "/assets": "Asset Fleet",
  "/requests": "Logistics Requests",
  "/audit": "Audit Log",
  "/users": "Users",
};

// Is the API answering? Checked every 20 seconds, so the person knows if the backend stops.
function useApiOnline() {
  const [online, setOnline] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .health()
        .then(() => alive && setOnline(true))
        .catch(() => alive && setOnline(false));
    check();
    const timer = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return online;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="clock" aria-label="Local time">
      {now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })}
      <b>{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</b>
    </span>
  );
}

export default function Layout() {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const online = useApiOnline();
  const [open, setOpen] = useState(false);
  const name = `${user.first_name} ${user.last_name}`;
  const title = TITLES[location.pathname] || "Enersync";

  // Close the mobile menu after every page change
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Zap size={20} />
          </span>
          <div>
            <strong>ENERSYNC</strong>
            <small>Operations Command</small>
          </div>
        </div>

        <nav className="nav">
          {NAV.filter((item) => item.show(role)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="user-meta">
              <strong title={name}>{name}</strong>
              <small>{ROLE_LABEL[role] || role}</small>
              <small className="muted">{user.location}</small>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
          <p className="disclaimer">Independent portfolio project. All data is fictional.</p>
        </div>
      </aside>

      {open && <button type="button" className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <h1>{title}</h1>
          <div className="topbar-right">
            <Clock />
            <span
              className={`pill ${online === false ? "pill-down" : online ? "pill-up" : ""}`}
              role="status"
              title={online === false ? "The backend is not answering" : "The backend is answering"}
            >
              <Activity size={14} aria-hidden="true" />
              {online === null ? "Checking" : online ? "API online" : "API offline"}
            </span>
          </div>
        </header>
        <main className="content" id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

