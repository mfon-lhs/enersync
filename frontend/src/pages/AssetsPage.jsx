import { ArrowDown, ArrowUp, ArrowUpDown, Cpu, Eye, Pencil, Plus, Search, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { can } from "../auth/roles.js";
import AssetModal from "../components/AssetModal.jsx";
import Pager from "../components/Pager.jsx";
import { EmptyState, ErrorState, LoadingRows } from "../components/States.jsx";
import { AssetStatusBadge } from "../components/StatusBadge.jsx";
import { formatCapacity, formatDate, inspectionInfo } from "../lib/format.js";
import { STATUS_ORDER } from "../lib/fleet.js";
import { useAsync, useDebounced } from "../lib/hooks.js";
import { ASSET_STATUS, colors } from "../theme.js";

const PAGE_SIZE = 12;

const COLUMNS = [
  { key: "asset_tag", label: "Tag" },
  { key: "name", label: "Asset" },
  { key: "status", label: "Status" },
  { key: "current_location", label: "Location" },
  { key: "utilization_pct", label: "Utilisation" },
  { key: "capacity", label: "Capacity" },
  { key: "inspection", label: "Next inspection" },
];

// The value a column sorts by
function sortValue(asset, key) {
  switch (key) {
    case "capacity":
      return asset.capacity_value ?? -1;
    case "inspection": {
      const info = inspectionInfo(asset);
      return info ? (info.dueAt ? info.dueAt.getTime() : -Infinity) : Infinity;
    }
    default:
      return asset[key];
  }
}

function compare(a, b, key, direction) {
  const left = sortValue(a, key);
  const right = sortValue(b, key);
  const result =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right, undefined, { numeric: true })
      : left < right
        ? -1
        : left > right
          ? 1
          : 0;
  return direction === "asc" ? result : -result;
}

function UtilBar({ value }) {
  const tone = value >= 85 ? colors.danger : value >= 70 ? colors.warning : colors.primary;
  return (
    <div className="util" title={`${value}% utilised`}>
      <div className="util-track" role="img" aria-label={`${value}% utilised`}>
        <div className="util-fill" style={{ width: `${value}%`, background: tone }} />
      </div>
      <span className="mono">{Math.round(value)}%</span>
    </div>
  );
}

function InspectionCell({ asset }) {
  const info = inspectionInfo(asset);
  if (!info) return <span className="muted">—</span>;
  if (info.never) return <span className="text-danger">Never inspected</span>;
  return (
    <div>
      <div className={info.overdue ? "text-danger" : ""}>{formatDate(info.dueAt)}</div>
      <small className={info.overdue ? "text-danger" : "muted"}>
        {info.overdue ? `${Math.abs(info.daysLeft)} d overdue` : info.daysLeft === 0 ? "due today" : `in ${info.daysLeft} d`}
      </small>
    </div>
  );
}

export default function AssetsPage() {
  const { role } = useAuth();
  const canManage = can.manageAssets(role);
  const { data: assets, error, loading, reload } = useAsync(api.listAssets, []);

  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim().toLowerCase(), 150);
  const [status, setStatus] = useState("All");
  const [location, setLocation] = useState("All");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [sort, setSort] = useState({ key: "asset_tag", direction: "asc" });
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(null); // { mode: "create" | "edit" | "view", asset }

  const all = assets || [];
  const locations = useMemo(() => [...new Set(all.map((a) => a.current_location))].sort(), [all]);
  const categories = useMemo(() => [...new Set(all.map((a) => a.category))].sort(), [all]);
  const counts = useMemo(() => {
    const result = { All: all.length };
    for (const asset of all) result[asset.status] = (result[asset.status] || 0) + 1;
    return result;
  }, [all]);

  const rows = useMemo(() => {
    const filtered = all.filter((asset) => {
      if (status !== "All" && asset.status !== status) return false;
      if (location !== "All" && asset.current_location !== location) return false;
      if (criticalOnly && !asset.is_critical) return false;
      if (!query) return true;
      return [asset.asset_tag, asset.name, asset.category, asset.current_location].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
    return filtered.sort((a, b) => compare(a, b, sort.key, sort.direction));
  }, [all, status, location, criticalOnly, query, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const filtersActive = status !== "All" || location !== "All" || criticalOnly || query !== "";

  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(0);
    };
  }

  function toggleSort(key) {
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
    setPage(0);
  }

  function clearFilters() {
    setSearch("");
    setStatus("All");
    setLocation("All");
    setCriticalOnly(false);
    setPage(0);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Asset fleet</h2>
          <p className="muted">Every piece of equipment, where it is and what condition it is in.</p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setModal({ mode: "create" })}>
            <Plus size={18} /> Add asset
          </button>
        )}
      </div>

      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search tag, name, category or location"
              value={search}
              onChange={(event) => changeFilter(setSearch)(event.target.value)}
              aria-label="Search assets"
            />
          </label>
          <select aria-label="Filter by location" value={location} onChange={(event) => changeFilter(setLocation)(event.target.value)}>
            <option value="All">All locations</option>
            {locations.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`chip ${criticalOnly ? "chip-on" : ""}`}
            aria-pressed={criticalOnly}
            onClick={() => changeFilter(setCriticalOnly)(!criticalOnly)}
          >
            <ShieldAlert size={14} /> Critical only
          </button>
          {filtersActive && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <X size={14} /> Clear filters
            </button>
          )}
        </div>

        <div className="chips" role="group" aria-label="Filter by status">
          {["All", ...STATUS_ORDER].map((value) => (
            <button
              key={value}
              type="button"
              className={`chip ${status === value ? "chip-on" : ""}`}
              style={value === "All" ? undefined : { "--chip": ASSET_STATUS[value].color }}
              aria-pressed={status === value}
              onClick={() => changeFilter(setStatus)(value)}
            >
              {value !== "All" && <span className="badge-dot" aria-hidden="true" />}
              {value === "All" ? "All" : ASSET_STATUS[value].label}
              <b>{counts[value] || 0}</b>
            </button>
          ))}
        </div>

        {loading && !assets ? (
          <LoadingRows rows={8} />
        ) : error && !assets ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Cpu} title={all.length === 0 ? "No assets yet" : "No assets match"}>
            {all.length === 0
              ? canManage
                ? "Add the first asset to start tracking your fleet."
                : "Ask a Logistics Manager to add assets."
              : "Try a different search or clear the filters."}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {COLUMNS.map((column) => {
                      const active = sort.key === column.key;
                      const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                      return (
                        <th key={column.key} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" className="th-sort" onClick={() => toggleSort(column.key)}>
                            {column.label}
                            <Icon size={13} aria-hidden="true" />
                          </button>
                        </th>
                      );
                    })}
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((asset) => (
                    <tr key={asset.asset_id}>
                      <td className="cell-tag">
                        <span className="mono">{asset.asset_tag}</span>
                      </td>
                      <td>
                        <div className="cell-title">
                          {asset.name}
                          {asset.is_critical && (
                            <span className="tag-critical" title="Critical asset">
                              Critical
                            </span>
                          )}
                        </div>
                        <small className="muted">{asset.category}</small>
                      </td>
                      <td>
                        <AssetStatusBadge status={asset.status} />
                      </td>
                      <td>{asset.current_location}</td>
                      <td>
                        <UtilBar value={asset.utilization_pct} />
                      </td>
                      <td className="mono">{formatCapacity(asset)}</td>
                      <td>
                        <InspectionCell asset={asset} />
                      </td>
                      <td className="cell-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${canManage ? "Edit" : "View"} ${asset.asset_tag}`}
                          title={canManage ? "Edit" : "View details"}
                          onClick={() => setModal({ mode: canManage ? "edit" : "view", asset })}
                        >
                          {canManage ? <Pencil size={17} /> : <Eye size={17} />}
                        </button>
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

      {modal && (
        <AssetModal
          mode={modal.mode}
          asset={modal.asset}
          categories={categories}
          locations={locations}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
