# Enersync: Design Notes

Last updated: 2026-11-14

## 1. What Enersync does

Enersync tracks energy-operations equipment (assets) and requests to move that equipment between locations. It records every change and controls what each user can do, based on their role.

People use it through a dark, industrial "command center" web interface: a live dashboard, an asset fleet table, a logistics requests portal and an audit log viewer. Sections 8 to 11 describe that interface.

This is an independent portfolio project, inspired by energy-operations logistics. It is not affiliated with TotalEnergies or any other company. All data in it is fictional.

## 2. Source of truth

`database/schema.sql` is the source of truth for table names, column names, and allowed values. If this document and the schema disagree, the schema wins, and this document must be updated.

The Python models and API must use the schema's column names, such as `user_id` and `password_hash`.

`schema.sql` creates a new, empty database. A database that already exists is upgraded with the numbered files in `database/migrations/`. The two must always end in the same structure.

## 3. Roles and permissions

Each user has exactly one role. The server checks the role on every request.

| Action | SuperAdmin | LogisticsManager | FieldTechnician | Viewer |
|---|---|---|---|---|
| Log in | Yes | Yes | Yes | Yes |
| View assets and requests | Yes | Yes | Yes | Yes |
| View the dashboard summary | Yes | Yes | Yes | Yes |
| View the recent activity feed | Yes | Yes | Yes | Yes |
| Create or edit assets | Yes | Yes | No | No |
| Raise a logistics request | Yes | Yes | Yes | No |
| Approve, reject, or complete requests | Yes | Yes | No | No |
| Manage users | Yes | No | No | No |
| View the audit log | Yes | No | No | No |

Hiding a button in the interface is not security. Every endpoint checks the role itself. The interface only hides what a role cannot use, so people are not shown buttons that would fail.

## 4. Data model

Allowed values (enums):
- `user_role`: SuperAdmin, LogisticsManager, FieldTechnician, Viewer
- `asset_status`: Operational, MaintenanceRequired, Decommissioned, InTransit
- `request_status`: Pending, Approved, Rejected, Completed
- `request_priority`: Low, Normal, High, Critical

### users
One row per person who can log in.
- `user_id` (primary key), `first_name`, `last_name`, `email` (unique)
- `password_hash`: bcrypt hash only, never plain text
- `role` (default FieldTechnician), `is_active` (default TRUE), `location`
- `created_at`, `updated_at` (updated automatically)

### assets
Equipment, vehicles, and field infrastructure.
- `asset_id` (primary key), `asset_tag` (unique, for example `ENS-PH-GEN-001`), `name`, `category`
- `status` (default Operational), `current_location`, `last_inspected_at`, `created_at`
- Command center columns, added in migration 001:
  - `capacity_value` and `capacity_unit`: the rated capacity, for example 500 and kVA. Both are filled in, or both are empty.
  - `utilization_pct`: how much of that capacity is in use, from 0 to 100 (default 0).
  - `is_critical`: a flag for assets that operations cannot do without (default FALSE).
  - `inspection_interval_days`: how often the asset must be inspected (default 90).
  - `latitude` and `longitude`: the position in decimal degrees. Both are filled in, or both are empty.

### logistics_requests
A request to move an asset from one place to another.
- `request_id` (primary key), `asset_id` (required), `requested_by` (required), `approved_by` (empty until approved)
- `origin`, `destination`, `status` (default Pending), `departure_date`, `estimated_arrival_date`, `notes`
- `priority` (default Normal): how urgent the move is, added in migration 001
- `created_at`, `updated_at` (updated automatically)

### audit_logs
A permanent history of changes.
- `log_id` (primary key), `user_id` (who acted; empty only when no logged-in user is involved)
- `action_type`, `table_name`, `record_id`
- `old_value`, `new_value`: the data before and after the change, stored as JSON
- `ip_address`, `created_at`

### Relationships
- A user can raise many requests and approve many requests.
- An asset can have many requests.
- A user can appear in many audit entries.

### Indexes
`assets(status)`, `assets(current_location)`, `logistics_requests(status)`, `logistics_requests(asset_id)`, `audit_logs(table_name, log_id DESC)` and `audit_logs(user_id)`. They keep the list pages and the audit log fast as the tables grow.

### Database checks
The database itself refuses a utilization outside 0 to 100, a latitude outside -90 to 90, a longitude outside -180 to 180, an inspection interval below 1, a negative capacity, and a half-filled capacity or coordinate pair. The API checks the same rules first, so people get a clear message instead of a database error.

## 5. Business rules

1. **Users are deactivated, never deleted.** Set `is_active` to FALSE. A deactivated user cannot log in, and their history stays readable.
2. **Assets are retired, never deleted.** Set the status to Decommissioned. The database refuses to delete an asset that requests refer to.
3. **Every change is audited.** Creating or editing an asset, raising, approving, rejecting, or completing a request, and creating or changing a user each write an audit entry. The entry is saved in the same transaction as the change. If the audit entry cannot be saved, the change is not saved either.
4. **Audit logs are append-only.** The application never edits or deletes them. The database does not enforce this yet.
5. **Passwords are never stored in plain text.** Only bcrypt hashes are saved.
6. **Request status flow.** A request starts as Pending. A SuperAdmin or LogisticsManager approves or rejects it. An approved request can then be marked Completed. Rejected and Completed are final. The server enforces this with `ALLOWED_NEXT_STATUS` in `main.py`, and answers any other change with a 409 error.
7. **A decommissioned asset cannot be moved.** Raising a request for one is refused with a 409 error.
8. **A request cannot arrive before it leaves.** If both dates are given, the estimated arrival date must not be earlier than the departure date.
9. **Capacity and position come in pairs.** A capacity value needs a unit, and a latitude needs a longitude. The reverse is also true.
10. **Inspection due date.** An asset is due for inspection on `last_inspected_at` plus `inspection_interval_days`. It is overdue when that date has passed and the asset is not Decommissioned. An asset that has never been inspected shows "Never inspected" and is not counted as overdue.
11. **Fleet availability.** Operational assets divided by all assets that are not Decommissioned, shown as a percentage.
12. **The activity feed is a safe summary.** It shows who did what to which record, and the names of the fields that changed. It never shows stored values, email addresses or IP addresses. Those stay in the audit log, which only a SuperAdmin can read.
13. **No invented readings.** Utilization is a number that people enter. The interface never makes up live telemetry, trend lines or history that the database does not hold.

## 6. Endpoints

All endpoints start with `/api`, except `/health`. The last column lists the roles allowed to call each one.

| Method | Path | Purpose | Allowed roles |
|---|---|---|---|
| GET | /health | Check that the API is running | Anyone |
| POST | /api/auth/login | Log in and receive a token | Any active user |
| GET | /api/auth/me | Get the logged-in user: name, role, location | All roles |
| GET | /api/assets | List assets. Optional `limit` and `skip`. | All roles |
| GET | /api/assets/{asset_id} | Get one asset | All roles |
| POST | /api/assets | Create an asset | SuperAdmin, LogisticsManager |
| PATCH | /api/assets/{asset_id} | Edit an asset, including retiring it | SuperAdmin, LogisticsManager |
| GET | /api/assets/summary | Count assets by status, for the dashboard | All roles |
| GET | /api/requests | List requests, newest first, with asset and people names. Optional `limit` and `skip`. | All roles |
| POST | /api/requests | Raise a request | SuperAdmin, LogisticsManager, FieldTechnician |
| PATCH | /api/requests/{request_id} | Approve, reject, or complete a request | SuperAdmin, LogisticsManager |
| GET | /api/activity | Safe summary of the newest audit rows. Optional `limit` (1 to 50, default 15). | All roles |
| GET | /api/users | List users | SuperAdmin |
| POST | /api/users | Create a user | SuperAdmin |
| PATCH | /api/users/{user_id} | Change a role or deactivate a user | SuperAdmin |
| GET | /api/audit-logs | Read the audit log. Optional `table_name`, `user_id`, `limit` (1 to 200, default 50) and `offset`. | SuperAdmin |

### Conventions
- **Paging.** `GET /api/assets` and `GET /api/requests` accept an optional `limit` (1 to 500) and `skip` (0 or more). With no `limit`, every row after `skip` is returned. The answer is still a plain JSON list. The total number of rows is sent in the `X-Total-Count` header. The audit log keeps its own `limit` and `offset`, because it was built and tested first.
- **Order.** Assets are ordered by `asset_id`. Requests and the audit log are newest first.
- **Errors.** Every error has a `detail`. A 422 from validation lists each problem with the field it belongs to, and the interface shows it under that field. A 401 always carries `WWW-Authenticate: Bearer`.
- **CORS.** Only `http://localhost:5173` and `http://127.0.0.1:5173` (Vite's development server) may call the API from a browser. Credentials, all methods and all headers are allowed for those two, and `X-Total-Count` is exposed so the browser can read it.

## 7. Technology choices

| Layer | Choice | Notes |
|---|---|---|
| Backend | Python with FastAPI | Local install is Python 3.15.2. The Docker image uses 3.12 for now (see open questions). |
| Database | PostgreSQL | Local install is version 18. Docker uses 16 until week 7, then switches to 18. |
| Database access | SQLAlchemy with the psycopg driver | Connection string starts with `postgresql+psycopg://` |
| Login tokens | JWT, valid for 60 minutes | The lifetime is set in `.env`. A token must carry both `sub` and `exp`. |
| Password hashing | bcrypt | |
| Frontend | React 19, built with Vite 7 | Create React App is not used. It was deprecated in February 2025. Needs the current Node.js LTS. |
| Routing | React Router 7 | Imported from `react-router`. The separate `react-router-dom` package is no longer needed. |
| Charts | Recharts 3 | Status distribution and request pipeline. Per-bar and per-slice colours use the `shape` prop, because `Cell` is deprecated. |
| Icons | Lucide (`lucide-react`) | |
| Styling | Plain CSS and one theme file | No Tailwind and no component kit. |
| Fonts | Inter for text, JetBrains Mono for tags, ids and JSON | Loaded from Google Fonts, with system fonts as a fallback. |
| Containers | Docker Compose | Week 7 |
| Continuous integration | GitHub Actions | Week 7. Runs tests and the linter on every push. |

## 8. Frontend architecture

The frontend lives in `frontend/` and is a single-page app. It talks to the API over HTTP and holds no business rules of its own. It mirrors them so that forms can give quick feedback, but the server is always the authority.

### Folder layout

```text
frontend/
  index.html
  package.json
  vite.config.js            port 5173, and it fails loudly if that port is busy
  .env.example              VITE_API_URL=http://127.0.0.1:8000
  src/
    main.jsx                applies the theme, then renders the app
    App.jsx                 routes
    theme.js                the ONLY place hex colours are written
    styles/                 base.css, layout.css, components.css, pages.css
    api/                    client.js (fetch wrapper) and index.js (one function per endpoint)
    auth/                   AuthContext.jsx, ProtectedRoute.jsx, permissions.js
    hooks/                  useResource.js (loading, error, polling), useNow.js
    lib/                    constants.js, format.js, metrics.js, diff.js
    components/
      layout/               AppShell, Sidebar, Topbar
      ui/                   buttons, badges, modal, confirm dialog, toasts, tables, forms, states
      charts/               StatusChart, PipelineChart, SiteMap
      dashboard/            ActivityFeed, AttentionList
      assets/               AssetFormModal
      requests/             RequestFormModal
      users/                UserFormModal
      audit/                JsonDiff
    pages/                  Login, Dashboard, Assets, Requests, Audit, Users, NotFound
```

### API client (`api/client.js`)
- **Bearer injection.** Every call adds `Authorization: Bearer <token>` automatically. Screens never touch the token.
- **401 interceptor.** A 401 from any call except login clears the token and tells the auth context to log out, which sends the person to the login page with the message "Your session has expired". Login itself is exempt, so a wrong password shows "Wrong email or password" on the form instead.
- **Errors.** Every failure becomes an `ApiError` with a status, a readable message and, for a 422, a map of field names to messages. If the API cannot be reached, the message says so and names the address it tried.
- **Paging.** `fetchAll` loads every page, 200 rows at a time, using `limit`, `skip` and `X-Total-Count`. Search and filters then run on the complete list, so they never miss rows.
- **Cancelling.** Calls take an abort signal, so a screen that closes stops its own requests.

### Session and tokens
1. Login posts to `/api/auth/login` and stores the token in `sessionStorage`, so it disappears when the tab closes.
2. The app then calls `/api/auth/me`. The role comes from the server's answer, never from the token.
3. When the page reloads, the app restores the token and calls `/api/auth/me` again before showing anything.
4. The app reads the token's expiry and logs the person out when it passes. The server still rejects an expired token on its own.
5. If the API cannot be reached while restoring a session, the app shows a retry screen. It does not log the person out.

### Role-based interface
Navigation and actions follow section 3.

| Screen or action | SuperAdmin | LogisticsManager | FieldTechnician | Viewer |
|---|---|---|---|---|
| Dashboard, Assets, Requests | Yes | Yes | Yes | Yes |
| New asset, edit asset | Yes | Yes | Read only | Read only |
| New request | Yes | Yes | Yes | No |
| Approve, reject, complete | Yes | Yes | No | No |
| Users screen | Yes | Hidden | Hidden | Hidden |
| Audit log screen | Yes | Hidden | Hidden | Hidden |

A person who types the address of a hidden screen sees a "Not allowed" panel. The server would refuse the data anyway.

### Data loading
- Each screen loads its data with `useResource`, which tracks loading and error state and can refresh itself.
- The dashboard refreshes every 30 seconds, and pauses while the browser tab is hidden. The word "Live" in the interface means exactly this: it polls. There are no WebSockets (see section 14).
- A refresh that fails keeps the old data on screen and shows a small "Reconnecting" note.

### Errors and empty states
- An error boundary around the page area means a crash in one screen leaves the sidebar working.
- Every list has a loading skeleton, an empty state and an error state with a Retry button.
- Success and failure of every action appear as a toast. Field errors appear under the field.

## 9. Design system

The look is a dark industrial command center: a near-black void, panels that sit slightly above it, thin cool borders, and two bright accents (electric blue to act, cyan to glow) used sparingly.

### Colour tokens
These are the exact values. They are written once, in `frontend/src/theme.js`, and every component uses them through that file or through the CSS variables it creates.

| Token | Hex | Used for |
|---|---|---|
| Void | `#07090E` | Page background |
| Surface | `#0D1322` | Cards, panels, tables, modals |
| Border | `#1E293B` | Borders and dividers |
| Primary | `#3B82F6` | Buttons, links, focus of interaction |
| Accent | `#00F0FF` | Glow, focus rings, active navigation, key figures |
| Text | `#F8FAFC` | Main text |
| Muted | `#94A3B8` | Secondary text, labels, axes |
| Emerald | `#10B981` | Operational, Approved |
| Amber | `#F59E0B` | Maintenance Required, Pending |
| Crimson | `#EF4444` | Decommissioned, Rejected, errors |
| Blue | `#3B82F6` | In Transit |

Shades such as a slightly lighter surface for hover, a sunken surface for inputs, or a 14% tint behind a badge are calculated from these values in `theme.js`. They are never typed in as new hex codes.

### Meaning of colour
| Item | Colour |
|---|---|
| Asset status | Operational emerald, Maintenance Required amber, Decommissioned crimson, In Transit blue |
| Request status | Pending amber, Approved emerald, Rejected crimson, Completed muted (a quiet, finished state) |
| Request priority | Low muted, Normal primary, High amber, Critical crimson |
| Roles | SuperAdmin accent, LogisticsManager primary, FieldTechnician emerald, Viewer muted |

Colour is never the only signal. Every badge also carries its text, and every status chart bar has a label and a value.

### Contrast
Measured ratios against WCAG 2.1 (4.5 to 1 is the minimum for normal text):

| Pair | Ratio |
|---|---|
| Text on Void | 19.03 to 1 |
| Text on Surface | 17.71 to 1 |
| Muted on Surface | 7.23 to 1 |
| Accent on Surface | 13.15 to 1 |
| Primary on Surface | 5.04 to 1 |
| Emerald on Surface | 7.30 to 1 |
| Amber on Surface | 8.63 to 1 |
| Crimson on Surface | 4.92 to 1 |
| Void on Primary (button text) | 5.41 to 1 |

White text on the Primary blue would only reach 3.52 to 1, so solid primary buttons use Void-coloured text instead. Borders are 1.27 to 1 against Surface. They are decoration, so no meaning depends on them.

### Typography, space and shape
- Inter at 14px for text, 600 weight for headings. Figures use tabular numbers so columns line up.
- JetBrains Mono at 12.5px for asset tags, ids, times and JSON.
- Spacing steps of 4px. Panel corners 14px. Controls 10px. Control height 38px.
- Panels have a 1px border and a faint top highlight. Key panels have small cyan corner brackets, the one deliberate "instrument panel" flourish.
- The page background is Void with a soft blue glow at the top left and a faint cyan glow at the bottom right, plus a fine grid that fades out toward the edges.

### Motion and accessibility
- Transitions last 120 to 250 ms. Panels rise in gently. The "Live" dot pulses. Skeletons shimmer.
- Every animation stops when the person's system asks for reduced motion.
- Keyboard focus shows a 2px Accent ring. Icon buttons have text labels for screen readers. Dialogs trap Escape, set `aria-modal` and name themselves. Toasts are announced politely.
- Layout works from about 360px wide upward. Below 900px the sidebar becomes a slide-in menu and tables scroll sideways inside their panel.

## 10. Screens

**Login.** A two-part screen: a brand panel (name, one-line purpose, three features, the "independent portfolio project, fictional data" notice) and a sign-in card. Email, password with a show toggle, a busy state, and the server's own error message. A session-expired notice appears here after an automatic logout.

**Shell.** A sidebar with the brand, grouped navigation filtered by role, and the independent-project notice. A top bar with the page title, an API status pill from `/health`, a local clock, and a user menu showing name, role, location and Sign out.

**Dashboard.**
- Six metric cards: total assets (with how many are critical), fleet availability with a share bar, maintenance required, in transit, pending requests (with how many are High or Critical), and overdue inspections. Each links to the matching filtered list.
- Asset status distribution: a bar chart from `/api/assets/summary`.
- Request pipeline: a donut of requests by status, with the total in the middle.
- Site positions: every asset that has coordinates, plotted by latitude and longitude and coloured by status, with the sites labelled. It is a plain position plot with no map tiles, so it needs no outside service.
- Needs attention: overdue inspections, High and Critical pending requests, and critical assets under maintenance, most urgent first.
- Recent activity: the feed from `/api/activity`.
- Latest requests.

**Assets.** A table with search (tag, name, category, location), status filter chips with counts, a category filter, a critical-only switch, an overdue-only switch and sortable columns. Columns: asset (tag, name, category), status, location, capacity, utilization bar, next inspection, critical flag. Pages of 10, 25 or 50. A modal creates or edits an asset, sends only the fields that changed, and shows server errors under the right field. People who cannot edit open the same modal read-only. The filters live in the address bar, so links from the dashboard land on the right view.

**Requests.** A table with status tabs and counts, a priority filter, search, and columns for id, asset, route, priority, status, requested by, schedule and actions. Action buttons appear only when both the role and the status allow them (section 11). Every status change asks for confirmation first, because Rejected and Completed cannot be undone. A modal raises a new request, with the origin filled in from the chosen asset's location.

**Audit log (SuperAdmin).** A table of entries newest first with filters for the table and the person, and previous and next paging. A banner states that the log is append-only. There are no edit or delete controls anywhere. Each row opens a field-by-field comparison of the old and new values, with the changed fields highlighted, and a raw JSON view.

**Users (SuperAdmin).** A table with search and filters, a modal to create a user, and actions to change a role or deactivate and reactivate. A SuperAdmin's own row has those actions disabled, matching the server rule.

## 11. Operational workflows

### Asset lifecycle
```text
  created
     |
     v
 Operational <-----------------> MaintenanceRequired
     |  ^                               |
     |  |                               |
     v  |                               |
  InTransit                             |
     |                                  |
     +----------> Decommissioned <------+     (final: retired, never deleted)
```
- A LogisticsManager or SuperAdmin sets the status by editing the asset. Any status may be chosen. Every edit is audited with the values before and after.
- Moving an asset between locations is requested through the requests portal, not by editing its location.
- Decommissioned is the end of an asset's life. It no longer counts toward availability, can no longer be moved, and is never overdue for inspection.

### Request lifecycle
```text
              +--> Approved --> Completed     (final)
  Pending ----+
              +--> Rejected                    (final)
```

| Step | Who | Result |
|---|---|---|
| Raise | SuperAdmin, LogisticsManager, FieldTechnician | A Pending request, with a priority, written to the audit log |
| Approve | SuperAdmin, LogisticsManager | The approver is recorded. Audit entry REQUEST_APPROVED. |
| Reject | SuperAdmin, LogisticsManager | Final. Audit entry REQUEST_REJECTED. |
| Complete | SuperAdmin, LogisticsManager | Final, and only from Approved. Audit entry REQUEST_COMPLETED. |

The interface offers only the buttons that `ALLOWED_NEXT_STATUS` permits for the request's current status and the person's role. If someone else changed the request in the meantime, the server answers 409, the interface shows that message and reloads the list.

### Priority
A request carries a priority of Low, Normal, High or Critical. High and Critical requests that are still Pending appear in Needs attention on the dashboard and count toward the "high priority" figure on the Pending requests card.

### Inspection workflow
1. Each asset has an inspection interval (default 90 days) and a last-inspected date.
2. The next inspection is due on the last-inspected date plus the interval.
3. Within 7 days of that date the asset shows as "due soon". After it, the asset is overdue.
4. A LogisticsManager or SuperAdmin records an inspection by editing the asset and setting the last-inspected date. The edit is audited like any other.

### Needs attention
The dashboard lists, most urgent first: Critical pending requests, overdue inspections on critical assets, other overdue inspections, High pending requests, and critical assets under maintenance. It shows at most six items and links each to its record.

### Session workflow
Login, then `/api/auth/me`, then the dashboard. If the token expires, or the server answers 401 for any reason, the app clears the session and returns to the login page with an explanation. Signing out clears the session on purpose. Nothing needs to be revoked on the server, because tokens are short lived.

### Audit workflow
Every change writes its audit entry in the same transaction. The audit screen is read-only. The dashboard feed shows a safe summary of the same entries to every role.

## 12. Decision log

| # | Decision | Reason |
|---|---|---|
| 1 | Use FastAPI for the backend | It generates interactive API documentation at /docs, and Python is the language being learned for this project |
| 2 | Use PostgreSQL | Industry standard. The schema uses PostgreSQL features such as ENUM types and JSONB. |
| 3 | Build the frontend with Vite, not Create React App | Create React App was deprecated in February 2025 |
| 4 | Use the schema's names for roles and statuses | One source of truth, so the code and database always agree |
| 5 | Enforce permissions on the server | Anyone can call the API directly, so hidden buttons are not protection |
| 6 | Deactivate users instead of deleting them | Audit history must stay readable |
| 7 | Retire assets by status, and block their deletion | Requests must keep a record of the asset they moved |
| 8 | Write the audit entry in the same transaction as the change | A change and its record either both save or both fail |
| 9 | Use the neutral `ENS-` asset tag prefix, and label the project as independent | Avoids implying an affiliation with TotalEnergies |
| 10 | Keep seed data fictional, and mark its passwords as placeholders | Demo data must never be mistaken for real people or assets |
| 11 | Create tables from schema.sql for now, and add Alembic migrations later | Keeps early learning simple. Migrations are how teams change a live database safely. |
| 12 | Upgrade existing databases with a numbered, repeatable SQL file | The live database and the test database must change without losing data. Each step checks first, so running the file twice is safe. |
| 13 | Allow only the two Vite origins in CORS, with credentials | A wildcard origin is unsafe once credentials are allowed. Browsers then refuse every other site. |
| 14 | Send paging totals in the `X-Total-Count` header and keep list bodies as plain lists | Existing callers and tests keep working, and the interface still learns the total |
| 15 | Use `skip` on assets and requests, and keep `offset` on the audit log | The audit log was built and tested first. Changing it now would break working code for no gain. |
| 16 | Add `GET /api/auth/me` | The interface needs the role and name. Reading them from the server avoids trusting what is inside a token. |
| 17 | Require `sub` and `exp` in every token, and add `WWW-Authenticate: Bearer` to every 401 | A token without an expiry would never stop working. The header is the standard signal to clients. |
| 18 | Keep the token in `sessionStorage` | It disappears when the tab closes. An HttpOnly cookie would be stronger and is listed as future work. |
| 19 | Add `GET /api/activity` as a safe summary for all roles | The dashboard needs a feed, but the audit log must stay SuperAdmin only. The summary leaves out values, emails and IP addresses. |
| 20 | Refuse requests for decommissioned assets on the server | Retired assets must stay put, and a hidden dropdown entry is not protection |
| 21 | One theme file holds every hex colour, and styles use variables | One place to change the look, and a check that the exact palette is used everywhere |
| 22 | Plain CSS instead of Tailwind or a component library | A bespoke look, no generic template feel, and fewer dependencies to keep up to date |
| 23 | Use Recharts `shape` instead of `Cell` | `Cell` is deprecated and will be removed in Recharts 4 |
| 24 | Import the router from `react-router` | In version 7 the separate `react-router-dom` package is no longer needed |
| 25 | Show no invented telemetry or trends | A dashboard that fakes data misleads people. Every figure comes from a table or a calculation on it. |
| 26 | Add priority, capacity, utilization, critical flag, inspection interval and coordinates | Each one feeds a visible part of the dashboard. Nothing was added "just in case". |

## 13. Open questions

1. **Python version in Docker.** Use 3.12, as planned, or 3.15 to match the local install?
2. **Maintenance requests.** The schema models only moves between locations. Should requests also cover maintenance? That would need a `request_type` column.
3. **Database enforcement of the audit log.** Should the database itself block changes to `audit_logs`?
4. **Demo hosting.** A free host, or Azure? Decide in week 8.
5. **Completing a move.** Completing a request does not yet change the asset. Should Completed set the asset's `current_location` to the destination, and should Approved set it to InTransit? Both changes would be audited. Until this is decided, an edited asset is the only way to change its location.
6. **Token storage.** Move the token from `sessionStorage` to an HttpOnly cookie, which needs CSRF protection on the API.
7. **Server-side search.** The tables search and filter in the browser over the full list. Past a few thousand rows, add `q` and `status` filters to the list endpoints.

## 14. Out of scope for now

These are stretch goals. Build the core first.
- Live tracking with WebSockets
- CSV or PDF report generation
- Offline mode for field technicians
- Converting the frontend to TypeScript, after the first version works
- Street-level maps with tiles
- Light theme
