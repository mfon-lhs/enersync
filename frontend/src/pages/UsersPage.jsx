import { UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ROLE_LABEL, ROLE_OPTIONS } from "../auth/roles.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingRows } from "../components/States.jsx";
import { useToast } from "../components/Toasts.jsx";
import UserModal from "../components/UserModal.jsx";
import { formatDate, fullName, initials } from "../lib/format.js";
import { useAsync } from "../lib/hooks.js";

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data: users, error, loading, reload } = useAsync(api.listUsers, []);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null); // the user whose active state will flip
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [savingRole, setSavingRole] = useState(null);

  async function changeRole(target, role) {
    if (role === target.role) return;
    setSavingRole(target.user_id);
    try {
      await api.updateUser(target.user_id, { role });
      toast.success(`${fullName(target)} is now ${ROLE_LABEL[role]}.`);
      reload();
    } catch (problem) {
      if (problem.status !== 401) toast.error(problem.message);
      reload();
    } finally {
      setSavingRole(null);
    }
  }

  async function flipActive() {
    setBusy(true);
    setConfirmError("");
    try {
      await api.updateUser(confirm.user_id, { is_active: !confirm.is_active });
      toast.success(`${fullName(confirm)} was ${confirm.is_active ? "deactivated" : "reactivated"}.`);
      setConfirm(null);
      reload();
    } catch (problem) {
      if (problem.status !== 401) setConfirmError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Users</h2>
          <p className="muted">Who can log in, and what their role lets them do. Users are deactivated, never deleted, so the audit trail stays readable.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <UserPlus size={18} /> Add user
        </button>
      </div>

      <section className="panel">
        {loading && !users ? (
          <LoadingRows rows={6} />
        ) : error && !users ? (
          <ErrorState error={error} onRetry={reload} />
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No users" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((person) => {
                  const itsMe = person.user_id === me.user_id;
                  return (
                    <tr key={person.user_id} className={person.is_active ? "" : "row-muted"}>
                      <td>
                        <div className="person">
                          <span className="avatar avatar-sm" aria-hidden="true">
                            {initials(fullName(person))}
                          </span>
                          <div>
                            <div className="cell-title">
                              {fullName(person)}
                              {itsMe && <span className="tag-you">You</span>}
                            </div>
                            <small className="muted">{person.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          aria-label={`Role for ${fullName(person)}`}
                          value={person.role}
                          disabled={itsMe || savingRole === person.user_id}
                          title={itsMe ? "You cannot change your own role" : undefined}
                          onChange={(event) => changeRole(person, event.target.value)}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{person.location}</td>
                      <td>
                        <span className="badge" style={{ "--badge": person.is_active ? "var(--operational)" : "var(--muted)" }}>
                          <span className="badge-dot" aria-hidden="true" />
                          {person.is_active ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td>{formatDate(person.created_at)}</td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${person.is_active ? "btn-ghost-danger" : "btn-soft"}`}
                          disabled={itsMe}
                          title={itsMe ? "You cannot deactivate yourself" : undefined}
                          onClick={() => {
                            setConfirmError("");
                            setConfirm(person);
                          }}
                        >
                          {person.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          {person.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <UserModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={`${confirm.is_active ? "Deactivate" : "Reactivate"} ${fullName(confirm)}?`}
          confirmLabel={confirm.is_active ? "Deactivate" : "Reactivate"}
          tone={confirm.is_active ? "danger" : "primary"}
          busy={busy}
          error={confirmError}
          onConfirm={flipActive}
          onCancel={() => setConfirm(null)}
        >
          <p>
            {confirm.is_active
              ? "They are locked out straight away, including any session that is already open, until you reactivate them. Their history stays in the audit log."
              : "They will be able to log in again with their existing password."}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
