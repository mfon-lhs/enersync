import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { api } from "../api/client.js";
import JsonDiff from "../components/JsonDiff.jsx";
import Pager from "../components/Pager.jsx";
import { EmptyState, ErrorState, LoadingRows } from "../components/States.jsx";
import { ActionBadge } from "../components/StatusBadge.jsx";
import { formatDateTime, fullName } from "../lib/format.js";
import { useAsync } from "../lib/hooks.js";

const PAGE_SIZE = 25;

const TABLES = [
  ["", "All records"],
  ["assets", "Assets"],
  ["logistics_requests", "Requests"],
  ["users", "Users"],
];

const TABLE_LABEL = { assets: "Asset", logistics_requests: "Request", users: "User" };

export default function AuditLogPage() {
  const [tableName, setTableName] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState(null);

  // The audit rows only hold a user number, so load the users once to show their names
  const { data: users } = useAsync(api.listUsers, []);
  const names = useMemo(() => new Map((users || []).map((u) => [u.user_id, fullName(u)])), [users]);

  const { data, error, loading, reload } = useAsync(
    () => api.auditLogs({ tableName: tableName || undefined, userId: userId || undefined, page, pageSize: PAGE_SIZE }),
    [tableName, userId, page],
  );

  function filter(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(0);
      setOpenId(null);
    };
  }

  const rows = data?.rows || [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Audit log</h2>
          <p className="muted">Every change, who made it, and the values before and after. Rows can never be edited or deleted.</p>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <select aria-label="Filter by record type" value={tableName} onChange={filter(setTableName)}>
            {TABLES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select aria-label="Filter by user" value={userId} onChange={filter(setUserId)}>
            <option value="">All users</option>
            {(users || []).map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {fullName(user)}
              </option>
            ))}
          </select>
        </div>

        {loading && !data ? (
          <LoadingRows rows={8} />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit rows">
            Nothing has been recorded for this filter.
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap" aria-busy={loading}>
              <table className="table table-audit">
                <thead>
                  <tr>
                    <th aria-label="Expand" />
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Record</th>
                    <th>IP address</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = openId === row.log_id;
                    const Chevron = open ? ChevronDown : ChevronRight;
                    return (
                      <Fragment key={row.log_id}>
                        <tr className={open ? "row-open" : ""}>
                          <td>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-expanded={open}
                              aria-label={`${open ? "Hide" : "Show"} changes for log ${row.log_id}`}
                              onClick={() => setOpenId(open ? null : row.log_id)}
                            >
                              <Chevron size={17} />
                            </button>
                          </td>
                          <td className="nowrap">{formatDateTime(row.created_at)}</td>
                          <td>{row.user_id ? names.get(row.user_id) || `User #${row.user_id}` : <span className="muted">System</span>}</td>
                          <td>
                            <ActionBadge action={row.action_type} />
                          </td>
                          <td>
                            {TABLE_LABEL[row.table_name] || row.table_name} <span className="mono">#{row.record_id}</span>
                          </td>
                          <td className="mono">{row.ip_address || "—"}</td>
                        </tr>
                        {open && (
                          <tr className="row-detail">
                            <td />
                            <td colSpan={5}>
                              <JsonDiff oldValue={row.old_value} newValue={row.new_value} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              pageCount={data.hasMore ? 0 : page + 1}
              onChange={(next) => {
                setPage(next);
                setOpenId(null);
              }}
              summary={`Rows ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + rows.length}, newest first`}
            />
          </>
        )}
      </section>
    </div>
  );
}
