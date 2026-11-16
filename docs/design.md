# Enersync: Design Notes

Last updated: 2026-11-16

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
8. **Completing a request moves the asset.** When a request becomes Completed, the asset's `current_location` becomes the request's destination. An asset that was InTransit becomes Operational again. A MaintenanceRequired asset keeps that status, because arriving somewhere does not repair it. The asset's latitude and longitude are cleared, because they described the old place and the new position is not known. If the asset was decommissioned after the request was approved, completing is refused with a 409 error and nothing changes. The move is audited as an ASSET_UPDATED row with the old and new values, saved in the same transaction as the request change. If the asset is already at the destination, no asset row is written. Approving or rejecting a request does not move the asset.
9. **A request cannot arrive before it leaves.** If both dates are given, the estimated arrival date must not be earlier than the departure date.
10. **Capacity and position come in pairs.** A capacity value needs a unit, and a latitude needs a longitude. The reverse is also true.
11. **Inspection due date.** An asset is due for inspection on `last_inspected_at` plus `inspection_interval_days`. It is overdue when that date has passed and the asset is not Decommissioned. An asset that has never been inspected is due straight away: the interface shows "Never inspected" and counts it as overdue. A decommissioned asset is never overdue. The interface works this out in the browser. The server does not store it.
12. **Fleet availability.** Operational assets divided by all assets that are not Decommissioned, shown as a percentage.
13. **The activity feed is a safe summary.** It shows who did what to which record, and the names of the fields that changed. It never shows stored values, email addresses or IP addresses. Those stay in the audit log, which only a SuperAdmin can read.
14. **No invented readings.** Utilization is a number that people enter. The interface never makes up live telemetry, trend lines or history that the database does not hold.
15. **A SuperAdmin cannot lock themselves out.** The server refuses (409) a SuperAdmin who tries to change their own role or deactivate their own account, so the last administrator cannot remove everyone's access. The Users screen disables those two controls on the person's own row.

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
| Backend | Python with FastAPI | Local install is Python 3.15.2. The Docker image uses Python 3.12 (decision 40). |
| Database | PostgreSQL | Local install is version 18. Docker uses `postgres:18-alpine`, so both match. |
| Database access | SQLAlchemy with the psycopg driver | Connection string starts with `postgresql+psycopg://` |
| Login tokens | JWT, valid for 60 minutes | The lifetime is set in `.env`. A token must carry both `sub` and `exp`. |
| Password hashing | bcrypt | |
| Frontend | React 19, built with Vite 6 | Create React App is not used. It was deprecated in February 2025. Needs the current Node.js LTS. |
| Routing | React Router 7 | Imported from `react-router`. The separate `react-router-dom` package is no longer needed. |
| Charts | Recharts 3 | Status distribution and utilisation by location. Per-bar and per-slice colours use the `shape` prop, because `Cell` is deprecated. |
| Icons | Lucide (`lucide-react`) | |
| Styling | Plain CSS and one theme file | No Tailwind and no component kit. |
| Fonts | Chakra Petch for headings, IBM Plex Sans for text, IBM Plex Mono for tags, ids and JSON | Loaded from Google Fonts, with system fonts as a fallback. |
| Containers | Docker Compose | Three services: database, API and web app (section 11, "Running with Docker"). The web app image is built with Node 24 and served by nginx. |
| Continuous integration | GitHub Actions | Week 7. Runs tests and the linter on every push. |

## 8. Frontend architecture

The frontend lives in `frontend/` and is a single-page app. It talks to the API over HTTP and holds no business rules of its own. It mirrors them so that forms can give quick feedback and screens can hide what a role cannot use, but the server is always the authority.

### Folder layout

```text
frontend/
  index.html                loads the fonts from Google Fonts
  package.json
  vite.config.js            port 5173, and it fails loudly if that port is busy
  .env.example              VITE_API_URL=http://127.0.0.1:8000
  src/
    main.jsx                applies the theme, then renders the app inside the providers
    App.jsx                 routes, and the RoleGate that guards the Audit log and Users screens
    theme.js                the ONLY place hex colours and fonts are written
    styles/                 base.css (page and shell), components.css, pages.css
    api/client.js           the fetch wrapper and one function per endpoint
    auth/                   AuthContext.jsx (login state), roles.js (what each role may do)
    lib/                    hooks.js (loading and polling), fleet.js (dashboard figures),
                            format.js (dates, numbers, inspection due date), jwt.js (token expiry)
    components/             Layout, Modal, ConfirmDialog, Toasts, ErrorBoundary, States, Pager, Field,
                            StatusBadge, MetricCard, JsonDiff, and the three forms:
                            AssetModal, RequestModal, UserModal
    pages/                  Login, Dashboard, Assets, Requests, AuditLog, Users, NotFound
```

### Start-up order
`main.jsx` applies the theme, then renders the app inside, from the outside in: an error boundary, the router, the toast provider and the auth provider. If any screen crashes while drawing, the error boundary replaces the whole page with a message and a "Back to the dashboard" button.

### API client (`api/client.js`)
- **Bearer injection.** Every call except login and `/health` adds `Authorization: Bearer <token>`. Screens never touch the token. With no usable token, the call is not even sent.
- **401 interceptor.** A 401 from any call except login clears the token and tells the auth context to log out, which shows the login page with the message "Your session has expired. Please log in again." Login itself is exempt, so a wrong password shows "Wrong email or password." on the form instead.
- **Errors.** Every failure becomes an `ApiError` with a status and a readable message. A 422 lists each problem with its field name. If the API cannot be reached, the message says so and names the address it tried.
- **Paging.** `listAll` loads every page of assets or requests, 500 rows at a time (the most the server allows), using `limit`, `skip` and the `X-Total-Count` header. Searching, filtering and sorting then run on the complete list, so they never miss rows. The audit log asks for one row more than a page shows, to learn whether a next page exists.

### Session and tokens
1. Login posts to `/api/auth/login` and stores the token in `sessionStorage` (or in memory only, if the browser blocks storage), so it disappears when the tab closes.
2. The app then calls `/api/auth/me`. The role comes from the server's answer, never from the token.
3. When the page reloads, the app finds the saved token, shows a loading ring and calls `/api/auth/me` again before showing anything.
4. The app reads the token's expiry and logs the person out at that moment. The server still rejects an expired token on its own, and refuses a token whose user was deactivated.
5. If the saved session cannot be restored for any reason, including a stopped backend, the app returns to the login page with the message "Could not restore your session."

### Role-based interface
Navigation and actions follow section 3. `auth/roles.js` mirrors the server's rules, and the server enforces them.

| Screen or action | SuperAdmin | LogisticsManager | FieldTechnician | Viewer |
|---|---|---|---|---|
| Command Center, Asset Fleet, Logistics | Yes | Yes | Yes | Yes |
| Add or edit an asset | Yes | Yes | Read only | Read only |
| New request, and "Request move" on an asset row | Yes | Yes | Yes | No |
| Approve, reject, complete | Yes | Yes | No | No |
| Users screen | Yes | Hidden | Hidden | Hidden |
| Audit log screen | Yes | Hidden | Hidden | Hidden |

The menu hides the screens a role cannot open. A person who types the address of a hidden screen is sent back to the dashboard. The server would refuse the data anyway.

### Data loading
- Each screen loads its data with `useAsync` (in `lib/hooks.js`), which tracks loading and error state and can reload itself.
- The dashboard reloads every 30 seconds, and pauses while the browser tab is hidden. The word "Live" means exactly this: it polls. There are no WebSockets (see section 14). A reload that fails keeps the old data on screen and shows "Could not refresh" with the reason.
- The top bar asks `/health` every 20 seconds and shows "API online" or "API offline".
- The Asset Fleet, Logistics and Users screens load once, and again after a change they made, or when the person presses Try again.

### Errors and empty states
- Every list has a loading skeleton, an empty state and an error state with a "Try again" button.
- Success and failure of an action appear as a toast. Field errors appear under the field, and a server error that belongs to the whole form appears at the top of the dialog.
- Dialogs name themselves for screen readers, close on Escape, keep Tab inside, and return focus to where it was.

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
| Operational | `#10B981` | Operational, Approved |
| Warning | `#F59E0B` | Maintenance Required, Pending |
| Danger | `#EF4444` | Decommissioned, Rejected, errors |
| Transit | `#3B82F6` | In Transit |

Shades such as a slightly lighter surface for hover, a sunken surface for inputs, or a tint behind a badge are calculated from these values with `color-mix` in the CSS. They are never typed in as new hex codes.

### Meaning of colour
| Item | Colour |
|---|---|
| Asset status | Operational green, Maintenance Required amber, In Transit blue, Decommissioned red |
| Request status | Pending amber, Approved green, Completed cyan, Rejected red |
| Request priority | Low muted, Normal blue, High amber, Critical red |
| Utilisation | Blue below 70%, amber from 70%, red from 85% |
| Audit action | Created and Approved green, Updated blue, Completed cyan, Rejected red |

Colour is never the only signal. Every badge carries its text and a dot, and every chart has a legend with labels and values.

### Contrast
Measured ratios against WCAG 2.1 (4.5 to 1 is the minimum for normal text):

| Pair | Ratio |
|---|---|
| Text on Void | 19.03 to 1 |
| Text on Surface | 17.71 to 1 |
| Muted on Surface | 7.23 to 1 |
| Accent on Surface | 13.15 to 1 |
| Primary on Surface | 5.04 to 1 |
| Operational on Surface | 7.30 to 1 |
| Warning on Surface | 8.63 to 1 |
| Danger on Surface | 4.92 to 1 |
| Void on Primary (button text) | 5.41 to 1 |

White text on the Primary blue would only reach 3.68 to 1, so solid primary buttons use Void-coloured text instead. Borders are 1.27 to 1 against Surface. They are decoration, so no meaning depends on them.

### Typography, space and shape
- Headings use Chakra Petch. Body text uses IBM Plex Sans at 14.5px. Asset tags, ids, times and JSON use IBM Plex Mono. All three load from Google Fonts, with the system fonts (Segoe UI and similar) as the fallback.
- Panel corners are 10px and smaller controls 7px.
- Panels have a 1px border, a faint top highlight and small cyan corner brackets, the one deliberate "instrument panel" flourish.
- The page background is Void with a soft blue glow at the top right, a faint cyan glow at the bottom left and a fine 44px grid.

### Motion and accessibility
- Transitions are short. Panels rise in gently, the "Live" dot pulses, skeletons shimmer and the dashboard figures count up. Every animation stops when the person's system asks for reduced motion.
- Keyboard focus shows a 2px Accent ring. Icon buttons have text labels for screen readers. Toasts are announced politely.
- Layout works from about 360px wide upward (checked at phone, tablet and laptop widths).
  - Below 960px the sidebar becomes a slide-in menu, and the menu closes after each navigation.
  - Below 900px the login screen drops its brand panel.
  - Below 640px every table row becomes a small card. The column headings are hidden, and each value shows its own heading above it. The buttons of a row sit at the bottom of its card, with their words back. Between 640px and about 1100px, tables that do not fit scroll sideways inside their panel.
  - Below 640px the top bar uses a smaller title, and the page's main button (such as Add asset) spans the full width.
  - Below 1440px the sidebar and the table cells get tighter so the Asset Fleet table fits at 1280px without sideways scrolling.
  - Below 1600px the "Request move" button on an asset row shows only its truck icon, with the name as a tooltip and for screen readers.

## 10. Screens

**Login.** A brand panel (name, one-line purpose, a decorative illustration of fictional sites and two short feature points, plus the "independent portfolio project, fictional data" notice) beside a sign-in card. Email, password with a show toggle, a busy state, and the server's own error message. The illustration uses fixed positions. It is not data. A session-expired notice appears here after an automatic logout.

**Shell.** A sidebar with the brand, navigation filtered by role (Command Center, Asset Fleet, Logistics, then Audit Log and Users for a SuperAdmin), the signed-in person's name, role and location, a Sign out button and the independent-project notice. A top bar with the page title, a local clock and the API status pill.

**Command Center (dashboard).**
- A "Live" bar with the time of the last refresh.
- Six metric cards:
  1. Total assets, with how many are operational.
  2. Fleet availability, as a percentage (rule 12).
  3. Critical assets at risk: critical assets, not decommissioned, that are under maintenance or overdue for inspection.
  4. Inspections overdue, with how many more fall due within 14 days.
  5. Pending requests, with how many are High or Critical.
  6. Assets in transit, with how many approved moves are open.
- Status distribution: a donut of assets by status, with the total in the middle and a legend with counts and percentages. The data comes from `/api/assets/summary`.
- Utilisation by location: a bar chart of the average utilisation of assets in service, busiest location first, coloured by the thresholds above.
- Recent activity: the newest 12 entries from `/api/activity`, each with an icon, the action, the record, who did it and how long ago.
- Needs attention: at most six assets, critical assets at risk first, then other overdue or soon-due inspections. Below it, urgent requests waiting: up to four High or Critical pending requests.

**Asset Fleet.** A table with search (tag, name, category, location), a location filter, status chips with counts, a "Critical only" switch and a "Clear filters" button. The Tag, Asset, Status, Location, Utilisation, Capacity and Next inspection columns sort. Pages of 12. The Asset column also shows the category and a "Critical" mark.
- The last column holds a **Request move** button, then an edit button (view for roles that cannot edit). The button is shown to people who may raise requests, and not on decommissioned assets. It opens the new-request dialog with the asset chosen and "From" filled in, so the cursor lands in "To".
- A dialog adds or edits an asset. It checks the same rules as the server, sends only the fields that changed (so each audit row shows exactly what was edited), and shows server errors in the dialog. People who cannot edit open the same dialog read-only.
- The filters are not kept in the address bar. Opening the screen again starts with no filters.

**Logistics (requests).** A table with status chips and counts, a priority filter, a sort (newest first, or most urgent first, which puts the oldest request first within a priority), and search over asset, route, person and request number. Pages of 10. Columns: id, asset, route, priority, status, requested by, arrival and actions.
- Action buttons appear only when both the role and the status allow them (section 11).
- Every status change asks for confirmation first, because Rejected and Completed cannot be undone. A 409 from the server shows its message in the confirmation and reloads the list.
- A details dialog shows a progress stepper, the people and dates, and the notes. It offers the same actions.
- A dialog raises a new request. Choosing an asset fills in "From" with where the asset is now. Decommissioned assets are not offered. It checks that the destination differs from the origin and that arrival is not before departure.

**Audit log (SuperAdmin).** A table of entries, newest first, with a record type filter and a user filter, and Previous and Next paging in pages of 25. The page says rows can never be edited or deleted, and there are no edit or delete controls. Each row opens a field-by-field comparison of the old and new values, with a switch to show unchanged fields and a raw JSON view.

**Users (SuperAdmin).** A table of every user with role, location, status and join date. A dropdown changes a role. A Deactivate or Reactivate button asks for confirmation. A dialog adds a user, with a password of at least 8 characters. A SuperAdmin's own row has the role dropdown and the Deactivate button disabled, matching the server rule (rule 15).

**Not found.** Any unknown address shows a short "not found" page inside the shell.

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
- The normal way to move an asset is a request. Completing the request changes the location (rule 8). A manager can also correct a location by editing the asset, and that edit is audited like any other.
- Decommissioned is the end of an asset's life. It no longer counts toward availability, can no longer be moved, and is never overdue for inspection.

### Request lifecycle
```text
              +--> Approved --> Completed     (final)
  Pending ----+
              +--> Rejected                    (final)
```

| Step | Who | Result |
|---|---|---|
| Raise | SuperAdmin, LogisticsManager, FieldTechnician | A Pending request, with a priority, written to the audit log (REQUEST_CREATED) |
| Approve | SuperAdmin, LogisticsManager | The approver is recorded. Audit entry REQUEST_APPROVED. |
| Reject | SuperAdmin, LogisticsManager | Final. Audit entry REQUEST_REJECTED. |
| Complete | SuperAdmin, LogisticsManager | Final, and only from Approved. Audit entry REQUEST_COMPLETED, and the asset moves to the destination (rule 8), with its own ASSET_UPDATED entry. |

The interface offers only the buttons that `NEXT_STATUS` (a copy of the server's `ALLOWED_NEXT_STATUS`) permits for the request's current status and the person's role. If someone else changed the request in the meantime, the server answers 409, the interface shows that message and reloads the list.

### Priority
A request carries a priority of Low, Normal, High or Critical. High and Critical requests that are still Pending count toward the "high or critical" figure on the Pending requests card and appear under "Urgent requests waiting" on the dashboard.

### Inspection workflow
1. Each asset has an inspection interval (default 90 days) and a last-inspected date.
2. The next inspection is due on the last-inspected date plus the interval.
3. After that date, the asset is overdue. Within 14 days before it, the asset counts as due soon.
4. An asset that has never been inspected is due straight away, so it counts as overdue and shows "Never inspected" (rule 11).
5. A LogisticsManager or SuperAdmin records an inspection by editing the asset and setting the last-inspected date. The edit is audited like any other.

### Needs attention
The dashboard lists critical assets at risk first (under maintenance, or overdue for inspection), then the other assets that are overdue or due soon. It shows at most six. Below that, it lists up to four High or Critical pending requests.

### Session workflow
Login, then `/api/auth/me`, then the dashboard. If the token expires, or the server answers 401 for any reason, the app clears the session and returns to the login page with an explanation. Signing out clears the session on purpose. Nothing needs to be revoked on the server, because tokens are short lived, and a deactivated user's token is refused on the next call.

### Audit workflow
Every change writes its audit entry in the same transaction. The audit screen is read-only. The dashboard feed shows a safe summary of the same entries to every role.

### Running and checking the frontend
1. Start the backend (`python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` in `backend`, with the virtual environment active).
2. In `frontend`, run `npm install` once, then `npm run dev`, and open http://localhost:5173.
3. `npm run build` checks that the whole app compiles.
4. `npm test` in `frontend` runs the frontend tests (Vitest, with Testing Library in a simulated browser). `npm run test:watch` re-runs them as files change. Backend tests run with `python -m pytest` in `backend`.

### Frontend tests
Tests sit next to the file they check, named `*.test.js` or `*.test.jsx`.

| Area | What is checked |
|---|---|
| `auth/roles.js` | The full role table (section 3), the allowed request status changes, and that an unknown role may do nothing |
| `api/client.js` | The Bearer header, the 401 interceptor, the readable error messages, paging through every row, and the audit log's extra-row trick |
| `lib/jwt.js`, `lib/format.js` | Token expiry, dates, the inspection due date (rule 11), names and labels |
| `lib/fleet.js` | The dashboard figures: availability (rule 12), critical assets at risk, overdue and due soon, chart data |
| Components | The dialog (Escape, backdrop, focus, scroll lock), the confirm dialog, the pager, the badges, the change viewer |
| Request form | Choosing an asset, the "Request move" starting state, every validation message, the data sent, server errors and recovery |

Pressing Tab to stay inside a dialog is not tested, because the simulated browser cannot measure layout. It is checked by hand in Chrome. The page screens (Assets, Requests, Users, Audit log) are also checked by hand for now.

### Running with Docker
Docker Compose runs the whole project with one command. Nothing else needs to be installed except Docker Desktop.

| Service | Image | Address on your computer |
|---|---|---|
| `db` | `postgres:18-alpine` | `localhost:5433` (for pgAdmin; 5433 avoids clashing with a local PostgreSQL on 5432) |
| `backend` | Built from `backend/Dockerfile` (Python 3.12) | http://localhost:8000, with docs at `/docs` |
| `frontend` | Built from `frontend/Dockerfile`, served by nginx | http://localhost:5173 |

1. Copy `.env.example` to `.env` and fill in the three values. `.env` is never committed.
2. Run `docker compose up --build`. The first run downloads the base images.
3. In a second terminal, run `docker compose exec backend python -m scripts.set_demo_passwords` once, to choose the demo passwords.
4. Stop with Ctrl + C or `docker compose down`. `docker compose down -v` also deletes the database, so the next start begins fresh.

Things to know:
- The database is created from `database/schema.sql` then `database/demo_data.sql`, mounted as `01-schema.sql` and `02-demo-data.sql`. PostgreSQL runs these only when its data volume is empty, in name order, so the numbers matter. To reload them, run `docker compose down -v`.
- The database password should use letters and numbers only, because it is placed inside a connection address.
- Ports 5173, 8000 and 5433 must be free. Stop `npm run dev` and `uvicorn` first.
- The API address is fixed into the web app when it is built (`VITE_API_URL`). Changing it needs `docker compose up --build`.
- The API always accepts browser requests from http://localhost:5173 and http://127.0.0.1:5173. Other web addresses, such as a hosted web app, are added with the `CORS_ORIGINS` setting (decision 43).

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
| 26 | Add priority, capacity, utilization, critical flag, inspection interval and coordinates | Each one feeds a visible part of the dashboard. Nothing was added "just in case". (Coordinates are stored and editable but not drawn yet. See section 13.) |
| 27 | Completing a request moves the asset, in the same transaction | Otherwise the fleet shows an asset at its old site after the move is done. Approving does not move it, because the move has not happened yet. |
| 28 | The frontend loads every page of assets and requests, then searches, filters and sorts in the browser | Results are complete and instant at this size. Server-side filtering is listed in section 13 for when the tables grow. |
| 29 | Chakra Petch, IBM Plex Sans and IBM Plex Mono for the interface | A technical, instrument-panel look that stays readable at small sizes. System fonts are the fallback. |
| 30 | Add a "Request move" button to each asset row | The place where someone sees the asset is the natural place to ask to move it. The dialog opens with the asset and origin filled in. |
| 31 | An asset that has never been inspected counts as overdue | Treating "never inspected" as fine would hide the assets most in need of a look. |
| 32 | Show a decorative illustration, not a map, on the login screen | The login screen has no data to plot, so it uses fixed fictional sites and says nothing it cannot back up (rule 14). |
| 33 | The server stops a SuperAdmin from demoting or deactivating themselves | The last administrator must not be able to lock everyone out. The interface disables the same controls as a courtesy. |
| 34 | Tighten the asset table on laptop screens and show only an icon on the "Request move" button below 1600px | The table must fit at 1280px without sideways scrolling. The full label returns on wide screens. |
| 35 | Turn table rows into cards on phones | A wide table on a phone hides its status and action buttons off-screen. Cards keep every value and button in view without sideways scrolling. |
| 36 | Test the frontend with Vitest and Testing Library | They are the standard pair for Vite and React projects, and tests run in a simulated browser so `npm test` is fast and needs no open browser. Tests cover rules and behaviour, not styling. |
| 37 | Run the database, API and web app together with Docker Compose | One command starts everything, so a reviewer needs only Docker. The API waits for a healthy database, and the web app waits for a healthy API. |
| 38 | Use `postgres:18-alpine` with a named volume mounted at `/var/lib/postgresql` | It matches the local version 18. From version 18 the image stores data in a version folder under that path, so the volume goes one level higher. |
| 39 | Create the demo database from two start-up scripts, and choose passwords by hand | The schema and demo data load on the first start only. Demo users get a placeholder hash, so no password is stored in the repository. `set_demo_passwords` sets real ones. |
| 40 | Use Python 3.12 in the backend image | It is a stable, widely supported version, and nothing in the project needs anything newer. The local install stays on 3.15.2. This settles former open question 1. |
| 41 | Serve the built web app with nginx and give the API address at build time | The browser needs only static files. nginx sends unknown addresses to `index.html` so refreshing a screen such as `/assets` works. Vite writes the API address into the files when built. |
| 42 | Keep secrets in a git-ignored `.env`, and fail with a clear message if one is missing | `.env.example` shows the names. Compose refuses to start without the password and the secret key, rather than starting with a weak default. |
| 43 | Read extra allowed web addresses from a `CORS_ORIGINS` setting | The hosted web app has a different address from the local one. The two local addresses stay allowed, so local work and Docker need no setting. Anything not listed is still refused. |

## 13. Open questions

1. ~~**Python version in Docker.**~~ Settled: 3.12 (decision 40).
2. **Maintenance requests.** The schema models only moves between locations. Should requests also cover maintenance? That would need a `request_type` column.
3. **Database enforcement of the audit log.** Should the database itself block changes to `audit_logs`?
4. **Demo hosting.** A free host, or Azure? Decide in week 8.
5. **Approved means in transit?** Should approving a request set the asset to InTransit? It is simple, but an asset can have several approved requests at once, so the rule would need a way to decide when it returns to Operational. For now only Completed changes the asset (rule 8 in section 5).
6. **Token storage.** Move the token from `sessionStorage` to an HttpOnly cookie, which needs CSRF protection on the API.
7. **Server-side search.** The tables search and filter in the browser over the full list. Past a few thousand rows, add `q` and `status` filters to the list endpoints.

8. **More frontend tests.** The logic, the shared components and the request form are tested (section 11). The four data screens, the login page and the route guard are not. Add tests for them, such as the role-based buttons on the Asset Fleet.
9. **Positions on screen.** Latitude and longitude are stored and can be edited, but nothing draws them. Plot them on the dashboard, or leave them for a later map?
10. **Filters in the address bar.** Keep the Asset Fleet and Logistics filters in the URL, so a filtered view can be linked to and the dashboard cards can open a filtered list.
11. **Completion warning.** The confirmation for "Mark completed" could say that the asset's location will change to the destination.
12. **Hidden screens.** A person who types the address of a screen they may not open is sent to the dashboard. Show a "Not allowed" message instead?
13. ~~**Allowed origins for deployment.**~~ Settled: the `CORS_ORIGINS` setting (decision 43).

## 14. Out of scope for now

These are stretch goals. Build the core first.
- Live tracking with WebSockets
- CSV or PDF report generation
- Offline mode for field technicians
- Converting the frontend to TypeScript, after the first version works
- Street-level maps with tiles
- Plotting asset coordinates on a map or position chart (see open question 9)
- Light theme
