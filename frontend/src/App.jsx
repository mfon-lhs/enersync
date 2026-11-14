import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/AuthContext.jsx";
import { can } from "./auth/roles.js";
import Layout from "./components/Layout.jsx";
import AssetsPage from "./pages/AssetsPage.jsx";
import AuditLogPage from "./pages/AuditLogPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import RequestsPage from "./pages/RequestsPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";

// A page that only some roles may open. Anyone else goes back to the dashboard.
function RoleGate({ allow, children }) {
  const { role } = useAuth();
  return allow(role) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div className="boot" role="status" aria-label="Restoring your session">
        <span className="boot-ring" />
      </div>
    );
  }

  // Not logged in: every address shows the login page
  if (status === "anonymous") {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route
          path="audit"
          element={
            <RoleGate allow={can.viewAuditLog}>
              <AuditLogPage />
            </RoleGate>
          }
        />
        <Route
          path="users"
          element={
            <RoleGate allow={can.manageUsers}>
              <UsersPage />
            </RoleGate>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
