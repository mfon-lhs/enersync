import { ArrowRight, Check, CheckCheck, Eye, Plus, Search, Truck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { NEXT_STATUS, can } from "../auth/roles.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import Modal from "../components/Modal.jsx";
import Pager from "../components/Pager.jsx";
import RequestModal from "../components/RequestModal.jsx";
import { EmptyState, ErrorState, LoadingRows } from "../components/States.jsx";
import { PriorityBadge, RequestStatusBadge } from "../components/StatusBadge.jsx";
import { useToast } from "../components/Toasts.jsx";
import { formatDate, formatDateTime, timeAgo } from "../lib/format.js";
import { useAsync, useDebounced } from "../lib/hooks.js";
import { PRIORITY, REQUEST_STATUS, colors } from "../theme.js";

const PAGE_SIZE = 10;
const STATUSES = ["Pending", "Approved", "Completed", "Rejected"];
const PRIORITY_RANK = { Critical: 0, High: 1, Normal: 2, Low: 3 };

// What each action looks like on a button, and what the confirmation says
const ACTIONS = {
  Approved: { label: "Approve", icon: Check, tone: "primary", verb: "approve" },
  Rejected: { label: "Reject", icon: X, tone: "danger", verb: "reject" },
  Completed: { label: "Mark completed", icon: CheckCheck, tone: "primary", verb: "mark as completed" },
};

function ActionButtons({ request, role, onAct, compact }) {
  if (!can.decideRequest(role)) return null;
  return NEXT_STATUS[request.status].map((next) => {
    const action = ACTIONS[next];
    const Icon = action.icon;
    return (
      <button
        key={next}
        type="button"
        className={`btn btn-sm ${next === "Rejected" ? "btn-ghost-danger" : "btn-soft"}`}
        onClick={() => onAct(request, next)}
        aria-label={`${action.label} request ${request.request_id}`}
      >
        <Icon size={14} /> {compact ? null : action.label}
      </button>
    );
  });
}

// Pending -> Approved -> Completed, or a stop at Rejected
function Stepper({ status }) {
  const rejected = status === "Rejected";
  const steps = rejected ? ["Pending", "Rejected"] : ["Pending", "Approved", "Completed"];
  const reached = steps.indexOf(status);
  return (
    <ol className="stepper" aria-label="Request progress">
      {steps.map((step, index) => {
        const done = index <= reached;
        const color = done ? REQUEST_STATUS[step].color : colors.border;
        return (
          <li key={step} className={done ? "step-done" : ""} style={{ "--step": color }} aria-current={index === reached ? "step" : undefined}>
            <span className="step-dot" />
            <span>{REQUEST_STATUS[step].label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DetailModal({ request, role, onAct, onClose }) {
  const rows = [
    ["Asset", `${request.asset_tag} · ${request.asset_name}`],
    ["Route", `${request.origin} → ${request.destination}`],
    ["Requested by", `${request.requested_by_name}, ${formatDateTime(request.created_at)}`],
    ["Approved by", request.approved_by_name || "—"],
    ["Departure", formatDateTime(request.departure_date)],
    ["Estimated arrival", formatDateTime(request.estimated_arrival_date)],
    ["Last changed", formatDateTime(request.updated_at)],
  ];
  const actionable = can.decideRequest(role) && NEXT_STATUS[request.status].length > 0;
  return (
    <Modal
      title={`Request #${request.request_id}`}
      subtitle={`${request.asset_tag} · ${request.asset_name}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          {actionable && <ActionButtons request={request} role={role} onAct={onAct} />}
        </>
      }
    >
      <div className="detail-badges">
        <RequestStatusBadge status={request.status} />
        <PriorityBadge priority={request.priority} />
      </div>
      <Stepper status={request.status} />
      <dl className="detail-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="detail-notes-title">Notes</h3>
      <p className="detail-notes">{request.notes || <span className="muted">No notes were added.</span>}</p>
    </Modal>
  );
}

export default function RequestsPage() {
  const { role } = useAuth();
  const toast = useToast();
  const { data: requests, error, loading, reload } = useAsync(api.listRequests, []);

  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim().toLowerCase(), 150);
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [order, setOrder] = useState("newest");
  const [page, setPage] = useState(0);

  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null); // a request id (so the dialog always shows fresh data)
  const [confirm, setConfirm] = useState(null); // { request, next }
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const all = requests || [];
  const counts = useMemo(() => {
    const result = { All: all.length };
    for (const request of all) result[request.status] = (result[request.status] || 0) + 1;
    return result;
  }, [all]);

  const rows = useMemo(() => {
    const filtered = all.filter((request) => {
      if (status !== "All" && request.status !== status) return false;
      if (priority !== "All" && request.priority !== priority) return false;
      if (!query) return true;
      return [request.asset_tag, request.asset_name, request.origin, request.destination, request.requested_by_name, String(request.request_id)]
        .some((value) => value.toLowerCase().includes(query));
    });
    if (order === "priority") {
      // Most urgent first. Within the same priority, the oldest request first (it has waited longest).
      filtered.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(a.created_at) - new Date(b.created_at));
    }
    return filtered; // the server already sends newest first
  }, [all, status, priority, query, order]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const detailRequest = detail ? all.find((r) => r.request_id === detail) : null;

  function ask(request, next) {
    setConfirmError("");
    setConfirm({ request, next });
  }

  async function runChange() {
    const { request, next } = confirm;
    setBusy(true);
    setConfirmError("");
    try {
      await api.changeRequestStatus(request.request_id, next);
      toast.success(`Request #${request.request_id} is now ${REQUEST_STATUS[next].label.toLowerCase()}.`);
      setConfirm(null);
      setDetail(null); // the action is done, so the detail dialog closes too
      reload();
    } catch (problem) {
      // A 409 means someone else already changed it, so show the server's message and refresh the list
      if (problem.status === 401) return;
      setConfirmError(problem.message);
      if (problem.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }

  const filterChange = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Logistics requests</h2>
          <p className="muted">Moves of equipment between sites, from request to delivery.</p>
        </div>
        {can.raiseRequest(role) && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} /> New request
          </button>
        )}
      </div>

      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search asset, route, person or request number"
              value={search}
              onChange={(event) => filterChange(setSearch)(event.target.value)}
              aria-label="Search requests"
            />
          </label>
          <select aria-label="Filter by priority" value={priority} onChange={(event) => filterChange(setPriority)(event.target.value)}>
            <option value="All">All priorities</option>
            {Object.keys(PRIORITY).map((value) => (
              <option key={value} value={value}>
                {PRIORITY[value].label}
              </option>
            ))}
          </select>
          <select aria-label="Sort requests" value={order} onChange={(event) => filterChange(setOrder)(event.target.value)}>
            <option value="newest">Newest first</option>
            <option value="priority">Most urgent first</option>
          </select>
        </div>

        <div className="chips" role="group" aria-label="Filter by status">
          {["All", ...STATUSES].map((value) => (
            <button
              key={value}
              type="button"
              className={`chip ${status === value ? "chip-on" : ""}`}
              style={value === "All" ? undefined : { "--chip": REQUEST_STATUS[value].color }}
              aria-pressed={status === value}
              onClick={() => filterChange(setStatus)(value)}
            >
              {value !== "All" && <span className="badge-dot" aria-hidden="true" />}
              {value === "All" ? "All" : REQUEST_STATUS[value].label}
              <b>{counts[value] || 0}</b>
            </button>
          ))}
        </div>

        {loading && !requests ? (
          <LoadingRows rows={7} />
        ) : error && !requests ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Truck} title={all.length === 0 ? "No requests yet" : "No requests match"}>
            {all.length === 0 ? "Raised requests will appear here." : "Try a different search or filter."}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Asset</th>
                    <th>Route</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Arrival</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((request) => (
                    <tr key={request.request_id}>
                      <td className="mono">{request.request_id}</td>
                      <td className="cell-tag">
                        <span className="mono">{request.asset_tag}</span>
                        <div className="muted">
                          <small>{request.asset_name}</small>
                        </div>
                      </td>
                      <td>
                        <div className="route">
                          <span>{request.origin}</span>
                          <ArrowRight size={14} aria-label="to" />
                          <span>{request.destination}</span>
                        </div>
                      </td>
                      <td>
                        <PriorityBadge priority={request.priority} />
                      </td>
                      <td>
                        <RequestStatusBadge status={request.status} />
                      </td>
                      <td>
                        <div>{request.requested_by_name}</div>
                        <small className="muted">{timeAgo(request.created_at)}</small>
                      </td>
                      <td>{request.estimated_arrival_date ? formatDate(request.estimated_arrival_date) : <span className="muted">—</span>}</td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          <ActionButtons request={request} role={role} onAct={ask} />
                          <button type="button" className="icon-btn" aria-label={`View request ${request.request_id}`} title="Details" onClick={() => setDetail(request.request_id)}>
                            <Eye size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={safePage}
              pageCount={pageCount}
              onChange={setPage}
              summary={`Showing ${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + visible.length} of ${rows.length}`}
            />
          </>
        )}
      </section>

      {creating && (
        <RequestModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {detailRequest && !confirm && (
        <DetailModal request={detailRequest} role={role} onAct={ask} onClose={() => setDetail(null)} />
      )}

      {confirm && (
        <ConfirmDialog
          title={`${ACTIONS[confirm.next].label} request #${confirm.request.request_id}?`}
          confirmLabel={ACTIONS[confirm.next].label}
          tone={ACTIONS[confirm.next].tone}
          busy={busy}
          error={confirmError}
          onConfirm={runChange}
          onCancel={() => setConfirm(null)}
        >
          <p>
            You are about to {ACTIONS[confirm.next].verb} the move of <b className="mono">{confirm.request.asset_tag}</b> from{" "}
            {confirm.request.origin} to {confirm.request.destination}.
          </p>
          <p className="muted">
            {confirm.next === "Rejected"
              ? "A rejected request cannot be reopened. The change is recorded in the audit log."
              : "This change is recorded in the audit log and cannot be reversed."}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
