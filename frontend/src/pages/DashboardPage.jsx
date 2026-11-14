import {
  Activity,
  OctagonAlert,
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Gauge,
  Hourglass,
  PackagePlus,
  PencilLine,
  ScrollText,
  Truck,
  UserCog,
  UserPlus,
  Wrench,
} from "lucide-react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, Rectangle, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client.js";
import MetricCard from "../components/MetricCard.jsx";
import { AssetStatusBadge, PriorityBadge } from "../components/StatusBadge.jsx";
import { EmptyState, ErrorState } from "../components/States.jsx";
import { useAsync } from "../lib/hooks.js";
import { fleetStats, statusSlices, utilisationByLocation } from "../lib/fleet.js";
import { humanize, inspectionInfo, timeAgo } from "../lib/format.js";
import { colors } from "../theme.js";

const REFRESH_MS = 30000;

async function loadDashboard() {
  const [summary, assets, requests, activity] = await Promise.all([
    api.assetSummary(),
    api.listAssets(),
    api.listRequests(),
    api.activity(12),
  ]);
  return { summary, assets, requests, activity };
}

// The text inside Recharts tooltips, drawn in the app's own style
function ChartTip({ active, payload, render }) {
  if (!active || !payload || payload.length === 0) return null;
  return <div className="chart-tip">{render(payload[0].payload)}</div>;
}

function StatusDonut({ slices, total }) {
  const visible = slices.filter((slice) => slice.value > 0);
  return (
    <div className="donut">
      <div className="donut-chart" role="img" aria-label={`Asset status distribution of ${total} assets`}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={visible.length > 1 ? 3 : 0}
              stroke={colors.surface}
              strokeWidth={2}
              shape={(props) => <Sector {...props} fill={visible[props.index]?.fill ?? colors.muted} />}
            />
            <Tooltip
              content={(props) => (
                <ChartTip {...props} render={(row) => `${row.label}: ${row.value} (${row.percent}%)`} />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-hidden="true">
          <strong>{total}</strong>
          <span>assets</span>
        </div>
      </div>
      <ul className="legend">
        {slices.map((slice) => (
          <li key={slice.status}>
            <span className="legend-dot" style={{ background: slice.fill }} aria-hidden="true" />
            <span className="legend-label">{slice.label}</span>
            <b>{slice.value}</b>
            <span className="muted legend-pct">{slice.percent}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UtilisationChart({ rows }) {
  if (rows.length === 0) {
    return <EmptyState icon={Gauge} title="No assets in service" />;
  }
  return (
    <div role="img" aria-label="Average utilisation by location">
      <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 44 + 30)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={colors.border} strokeDasharray="3 4" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke={colors.border}
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="location"
            width={150}
            stroke={colors.border}
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={(props) => (
              <ChartTip
                {...props}
                render={(row) => `${row.location}: ${row.average}% across ${row.assets} asset${row.assets === 1 ? "" : "s"}`}
              />
            )}
          />
          <Bar
            dataKey="average"
            radius={[0, 4, 4, 0]}
            shape={(props) => <Rectangle {...props} fill={rows[props.index]?.fill ?? colors.primary} />}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-note muted">
        <span className="legend-dot" style={{ background: colors.primary }} /> under 70%
        <span className="legend-dot" style={{ background: colors.warning }} /> 70% and over
        <span className="legend-dot" style={{ background: colors.danger }} /> 85% and over
      </p>
    </div>
  );
}

const ACTIVITY_ICONS = {
  ASSET_CREATED: PackagePlus,
  ASSET_UPDATED: PencilLine,
  REQUEST_CREATED: Truck,
  REQUEST_APPROVED: ClipboardCheck,
  REQUEST_REJECTED: OctagonAlert,
  REQUEST_COMPLETED: ClipboardCheck,
  USER_CREATED: UserPlus,
  USER_UPDATED: UserCog,
};

function ActivityFeed({ items }) {
  if (items.length === 0) return <EmptyState icon={ScrollText} title="No activity yet" />;
  return (
    <ol className="feed">
      {items.map((item) => {
        const Icon = ACTIVITY_ICONS[item.action_type] || ScrollText;
        return (
          <li key={item.log_id}>
            <span className="feed-icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            <div className="feed-body">
              <div>
                <b>{humanize(item.action_type)}</b> <span className="mono">{item.target_label}</span>
              </div>
              <div className="muted feed-meta">
                {item.actor_name || "System"}
                {item.detail ? ` · ${item.detail}` : ""}
              </div>
            </div>
            <time className="muted" dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>
              {timeAgo(item.created_at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

function AttentionList({ stats }) {
  const rows = [
    ...stats.criticalAtRisk.map((asset) => ({ asset, critical: true })),
    ...[...stats.overdue, ...stats.dueSoon]
      .filter((asset) => !stats.criticalAtRisk.includes(asset))
      .map((asset) => ({ asset, critical: false })),
  ].slice(0, 6);

  if (rows.length === 0) {
    return <EmptyState icon={Wrench} title="Nothing needs attention">All inspections are on schedule.</EmptyState>;
  }
  return (
    <ul className="attention">
      {rows.map(({ asset, critical }) => {
        const info = inspectionInfo(asset);
        return (
          <li key={asset.asset_id}>
            <div>
              <span className="mono">{asset.asset_tag}</span>
              {critical && <span className="tag-critical">Critical</span>}
              <div className="muted">{asset.name}</div>
            </div>
            <div className="attention-right">
              <AssetStatusBadge status={asset.status} />
              <small className={info?.overdue ? "text-danger" : "muted"}>
                {info?.never
                  ? "Never inspected"
                  : info?.overdue
                    ? `Inspection ${Math.abs(info.daysLeft)} d overdue`
                    : `Inspection in ${info?.daysLeft} d`}
              </small>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const { data, error, loading, updatedAt, reload } = useAsync(loadDashboard, [], { intervalMs: REFRESH_MS });

  if (error && !data) {
    return (
      <section className="panel">
        <ErrorState error={error} onRetry={reload} />
      </section>
    );
  }

  const stats = data ? fleetStats(data.summary, data.assets, data.requests) : null;
  const slices = data ? statusSlices(data.summary) : [];
  const locations = data ? utilisationByLocation(data.assets) : [];
  const waiting = loading || !data;

  return (
    <div className="dashboard">
      <div className="live-bar">
        <span className="live-dot" aria-hidden="true" />
        <span>Live</span>
        <span className="muted">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · refreshes every 30 s` : "Loading…"}
        </span>
        {error && data && <span className="text-warn">Could not refresh: {error.message}</span>}
      </div>

      <div className="metrics">
        <MetricCard icon={Boxes} label="Total assets" value={stats?.total} loading={waiting} color={colors.primary} hint={stats ? `${stats.operational} operational` : ""} />
        <MetricCard icon={Gauge} label="Fleet availability" value={stats?.availability} suffix="%" loading={waiting} color={colors.operational} hint="Operational, of assets in service" />
        <MetricCard
          icon={OctagonAlert}
          label="Critical assets at risk"
          value={stats?.criticalAtRisk.length}
          loading={waiting}
          color={stats?.criticalAtRisk.length ? colors.danger : colors.operational}
          hint={stats ? `of ${stats.criticalTotal} critical assets` : ""}
        />
        <MetricCard
          icon={Wrench}
          label="Inspections overdue"
          value={stats?.overdue.length}
          loading={waiting}
          color={stats?.overdue.length ? colors.warning : colors.operational}
          hint={stats ? `${stats.dueSoon.length} more due within 14 days` : ""}
        />
        <MetricCard
          icon={Hourglass}
          label="Pending requests"
          value={stats?.pending.length}
          loading={waiting}
          color={colors.warning}
          hint={stats ? `${stats.urgentPending.length} high or critical` : ""}
        />
        <MetricCard icon={Truck} label="Assets in transit" value={stats?.inTransit} loading={waiting} color={colors.accent} hint={stats ? `${stats.approved.length} approved moves open` : ""} />
      </div>

      <div className="grid-2">
        <section className="panel">
          <header className="panel-head">
            <h2>Status distribution</h2>
          </header>
          {waiting ? <div className="skeleton skeleton-chart" /> : <StatusDonut slices={slices} total={stats.total} />}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Utilisation by location</h2>
          </header>
          {waiting ? <div className="skeleton skeleton-chart" /> : <UtilisationChart rows={locations} />}
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <header className="panel-head">
            <h2>
              <Activity size={16} aria-hidden="true" /> Recent activity
            </h2>
          </header>
          {waiting ? <div className="skeleton skeleton-chart" /> : <ActivityFeed items={data.activity} />}
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Needs attention</h2>
            <Link to="/assets" className="link-more">
              Asset fleet <ArrowRight size={14} />
            </Link>
          </header>
          {waiting ? <div className="skeleton skeleton-chart" /> : <AttentionList stats={stats} />}

          {!waiting && stats.urgentPending.length > 0 && (
            <>
              <header className="panel-head panel-head-sub">
                <h3>Urgent requests waiting</h3>
                <Link to="/requests" className="link-more">
                  Logistics <ArrowRight size={14} />
                </Link>
              </header>
              <ul className="attention">
                {stats.urgentPending.slice(0, 4).map((request) => (
                  <li key={request.request_id}>
                    <div>
                      <span className="mono">{request.asset_tag}</span>
                      <div className="muted">
                        {request.origin} → {request.destination}
                      </div>
                    </div>
                    <div className="attention-right">
                      <PriorityBadge priority={request.priority} />
                      <small className="muted">{timeAgo(request.created_at)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
