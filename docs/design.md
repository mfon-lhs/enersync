# Enersync: Design Notes

Last updated: 2026-11-04

## 1. What Enersync does

Enersync tracks energy-operations equipment (assets) and requests to move that equipment between locations. It records every change and controls what each user can do, based on their role.

This is an independent portfolio project, inspired by energy-operations logistics. It is not affiliated with TotalEnergies or any other company. All data in it is fictional.

## 2. Source of truth

`database/schema.sql` is the source of truth for table names, column names, and allowed values. If this document and the schema disagree, the schema wins, and this document must be updated.

The Python models and API must use the schema's column names, such as `user_id` and `password_hash`.

## 3. Roles and permissions

Each user has exactly one role. The server checks the role on every request.

| Action | SuperAdmin | LogisticsManager | FieldTechnician | Viewer |
|---|---|---|---|---|
| Log in | Yes | Yes | Yes | Yes |
| View assets and requests | Yes | Yes | Yes | Yes |
| View the dashboard summary | Yes | Yes | Yes | Yes |
| Create or edit assets | Yes | Yes | No | No |
| Raise a logistics request | Yes | Yes | Yes | No |
| Approve, reject, or complete requests | Yes | Yes | No | No |
| Manage users | Yes | No | No | No |
| View the audit log | Yes | No | No | No |

Hiding a button in the interface is not security. Every endpoint checks the role itself.

## 4. Data model

Allowed values (enums):
- `user_role`: SuperAdmin, LogisticsManager, FieldTechnician, Viewer
- `asset_status`: Operational, MaintenanceRequired, Decommissioned, InTransit
- `request_status`: Pending, Approved, Rejected, Completed

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

### logistics_requests
A request to move an asset from one place to another.
- `request_id` (primary key), `asset_id` (required), `requested_by` (required), `approved_by` (empty until approved)
- `origin`, `destination`, `status` (default Pending), `departure_date`, `estimated_arrival_date`, `notes`
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

## 5. Business rules

1. **Users are deactivated, never deleted.** Set `is_active` to FALSE. A deactivated user cannot log in, and their history stays readable.
2. **Assets are retired, never deleted.** Set the status to Decommissioned. The database refuses to delete an asset that requests refer to.
3. **Every change is audited.** Creating or editing an asset, approving, rejecting, or completing a request, and changing a user's role each write an audit entry. The entry is saved in the same transaction as the change. If the audit entry cannot be saved, the change is not saved either.
4. **Audit logs are append-only.** The application never edits or deletes them. The database does not enforce this yet.
5. **Passwords are never stored in plain text.** Only bcrypt hashes are saved.
6. **Request status flow.** A request starts as Pending. A SuperAdmin or LogisticsManager approves or rejects it. An approved request can then be marked Completed. Rejected and Completed are final.
   *This flow is proposed in this document. Confirm it or change it.*

## 6. Endpoints

All endpoints start with `/api`. The last column lists the roles allowed to call each one.

| Method | Path | Purpose | Allowed roles |
|---|---|---|---|
| POST | /api/auth/login | Log in and receive a token | Any active user |
| GET | /api/assets | List assets | All roles |
| GET | /api/assets/{asset_id} | Get one asset | All roles |
| POST | /api/assets | Create an asset | SuperAdmin, LogisticsManager |
| PATCH | /api/assets/{asset_id} | Edit an asset, including retiring it | SuperAdmin, LogisticsManager |
| GET | /api/assets/summary | Count assets by status, for the dashboard | All roles |
| GET | /api/requests | List requests | All roles |
| POST | /api/requests | Raise a request | SuperAdmin, LogisticsManager, FieldTechnician |
| PATCH | /api/requests/{request_id} | Approve, reject, or complete a request | SuperAdmin, LogisticsManager |
| GET | /api/users | List users | SuperAdmin |
| POST | /api/users | Create a user | SuperAdmin |
| PATCH | /api/users/{user_id} | Change a role or deactivate a user | SuperAdmin |
| GET | /api/audit-logs | Read the audit log | SuperAdmin |

## 7. Technology choices

| Layer | Choice | Notes |
|---|---|---|
| Backend | Python with FastAPI | Local install is Python 3.15.2. The Docker image uses 3.12 for now (see open questions). |
| Database | PostgreSQL | Local install is version 18. Docker uses 16 until week 7, then switches to 18. |
| Database access | SQLAlchemy with the psycopg driver | Connection string starts with `postgresql+psycopg://` |
| Login tokens | JWT, valid for 60 minutes | The lifetime is set in `.env` |
| Password hashing | bcrypt | |
| Frontend | React, built with Vite | Create React App is not used. It was deprecated in February 2025. |
| Charts | Recharts | Dashboard bar chart |
| Containers | Docker Compose | Week 7 |
| Continuous integration | GitHub Actions | Week 7. Runs tests and the linter on every push. |

## 8. Decision log

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

## 9. Open questions

1. **Python version in Docker.** Use 3.12, as planned, or 3.15 to match the local install?
2. **Maintenance requests.** The schema models only moves between locations. Should requests also cover maintenance? That would need a `request_type` column.
3. **Database enforcement of the audit log.** Should the database itself block changes to `audit_logs`?
4. **Demo hosting.** A free host, or Azure? Decide in week 8.

## 10. Out of scope for now

These are stretch goals. Build the core first.
- Live tracking with WebSockets
- CSV or PDF report generation
- Offline mode for field technicians
- Converting the frontend to TypeScript, after the first version works
