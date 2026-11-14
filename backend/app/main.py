from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.models.asset import Asset
from app.models.audit_log import AuditLog
from app.models.logistics_request import LogisticsRequest
from app.models.user import User
from app.schemas.activity import ActivityItem
from app.schemas.asset import AssetCreate, AssetRead, AssetSummary, AssetUpdate
from app.schemas.audit_log import AuditLogRead
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.logistics_request import RequestCreate, RequestListItem, RequestRead, RequestUpdate
from app.schemas.user import UserCreate, UserRead, UserUpdate

app = FastAPI(title="Enersync API", version="0.2.0")

# The web pages that may call this API from a browser: the Vite development server.
# A browser refuses to let any other page read the answers, even if it knows this API's address.
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the browser read the X-Total-Count header that the list endpoints send
    expose_headers=["X-Total-Count"],
)

# The status changes that are allowed. Any other change is refused with a 409 error.
ALLOWED_NEXT_STATUS = {
    "Pending": {"Approved", "Rejected"},
    "Approved": {"Completed"},
}

# The audit action to record for each new status
AUDIT_ACTION_FOR_STATUS = {
    "Approved": "REQUEST_APPROVED",
    "Rejected": "REQUEST_REJECTED",
    "Completed": "REQUEST_COMPLETED",
}


def set_total_count(response: Response, total: int | None) -> None:
    """Tell the caller how many rows exist in total, so it can work out how many pages there are."""
    response.headers["X-Total-Count"] = str(total or 0)


def activity_target(log: AuditLog) -> str:
    """The thing an audit row is about, in words a person can read. It never includes an email address."""
    data = log.new_value or log.old_value or {}
    if log.table_name == "assets":
        return data.get("asset_tag") or f"Asset #{log.record_id}"
    if log.table_name == "logistics_requests":
        return f"Request #{log.record_id}"
    if log.table_name == "users":
        name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
        return name or f"User #{log.record_id}"
    return f"{log.table_name} #{log.record_id}"


def activity_detail(log: AuditLog) -> str | None:
    """A short note on what happened. It names the fields that changed, never their values."""
    old = log.old_value or {}
    new = log.new_value or {}
    if log.table_name == "logistics_requests" and new:
        return f"{new.get('origin', '?')} to {new.get('destination', '?')}"
    if old and new:
        changed = [key for key in new if key != "updated_at" and old.get(key) != new.get(key)]
        if changed:
            return "Changed " + ", ".join(changed)
    return None


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Wrong email or password")
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    return TokenResponse(access_token=create_access_token(user.user_id))


@app.get("/api/auth/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    # The web app calls this right after login to learn the user's name and role.
    # The role is read from the database here, never from the token.
    return current_user


# ---------- Assets ----------


# This route must stay above /api/assets/{asset_id}, or FastAPI reads "summary" as an asset id
@app.get("/api/assets/summary", response_model=AssetSummary, dependencies=[Depends(get_current_user)])
def assets_summary(db: Session = Depends(get_db)):
    # Start every status at 0, so statuses with no assets still appear in the answer
    counts = {status: 0 for status in ["Operational", "MaintenanceRequired", "Decommissioned", "InTransit"]}
    rows = db.execute(select(Asset.status, func.count()).group_by(Asset.status)).all()
    for status, count in rows:
        counts[status] = count
    return AssetSummary(total=sum(counts.values()), by_status=counts)


@app.get("/api/assets", response_model=list[AssetRead], dependencies=[Depends(get_current_user)])
def list_assets(
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    # With no limit, every asset after "skip" is returned. The total goes in a header,
    # so the answer itself stays a plain list.
    set_total_count(response, db.scalar(select(func.count()).select_from(Asset)))
    query = select(Asset).order_by(Asset.asset_id).offset(skip)
    if limit is not None:
        query = query.limit(limit)
    return db.scalars(query).all()


@app.get("/api/assets/{asset_id}", response_model=AssetRead, dependencies=[Depends(get_current_user)])
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@app.post("/api/assets", response_model=AssetRead, status_code=201)
def create_asset(
    data: AssetCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin", "LogisticsManager")),
):
    asset = Asset(**data.model_dump())
    db.add(asset)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An asset with this tag already exists")

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action_type="ASSET_CREATED",
            table_name="assets",
            record_id=asset.asset_id,
            old_value=None,
            new_value=AssetRead.model_validate(asset).model_dump(mode="json"),
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(asset)
    return asset


@app.patch("/api/assets/{asset_id}", response_model=AssetRead)
def update_asset(
    asset_id: int,
    data: AssetUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin", "LogisticsManager")),
):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Only the fields the user actually sent are changed
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return asset

    old_value = AssetRead.model_validate(asset).model_dump(mode="json")
    for field, value in changes.items():
        setattr(asset, field, value)

    # These pairs must be filled in together. The database enforces this too,
    # but a clear 422 message is kinder than a database error.
    if (asset.latitude is None) != (asset.longitude is None):
        raise HTTPException(status_code=422, detail="Latitude and longitude must be set together")
    if (asset.capacity_value is None) != (asset.capacity_unit is None):
        raise HTTPException(status_code=422, detail="Capacity value and unit must be set together")

    new_value = AssetRead.model_validate(asset).model_dump(mode="json")

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action_type="ASSET_UPDATED",
            table_name="assets",
            record_id=asset.asset_id,
            old_value=old_value,
            new_value=new_value,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(asset)
    return asset


# ---------- Logistics requests ----------


@app.get("/api/requests", response_model=list[RequestListItem], dependencies=[Depends(get_current_user)])
def list_requests(
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    set_total_count(response, db.scalar(select(func.count()).select_from(LogisticsRequest)))

    # Each row also carries the asset's tag and name and the people's names,
    # so a screen can show them without making more calls. Newest request first.
    requester = aliased(User)
    approver = aliased(User)
    query = (
        select(
            LogisticsRequest,
            Asset.asset_tag,
            Asset.name,
            requester.first_name,
            requester.last_name,
            approver.first_name,
            approver.last_name,
        )
        .join(Asset, Asset.asset_id == LogisticsRequest.asset_id)
        .join(requester, requester.user_id == LogisticsRequest.requested_by)
        .outerjoin(approver, approver.user_id == LogisticsRequest.approved_by)
        .order_by(LogisticsRequest.request_id.desc())
        .offset(skip)
    )
    if limit is not None:
        query = query.limit(limit)

    rows = db.execute(query).all()

    items = []
    for row, asset_tag, asset_name, requester_first, requester_last, approver_first, approver_last in rows:
        items.append(
            RequestListItem(
                **RequestRead.model_validate(row).model_dump(),
                asset_tag=asset_tag,
                asset_name=asset_name,
                requested_by_name=f"{requester_first} {requester_last}",
                approved_by_name=f"{approver_first} {approver_last}" if approver_first is not None else None,
            )
        )
    return items


@app.post("/api/requests", response_model=RequestRead, status_code=201)
def create_request(
    data: RequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin", "LogisticsManager", "FieldTechnician")),
):
    # A request can only be raised for an asset that exists
    asset = db.get(Asset, data.asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    # A retired asset stays where it is
    if asset.status == "Decommissioned":
        raise HTTPException(status_code=409, detail="A decommissioned asset cannot be moved")

    logistics_request = LogisticsRequest(
        asset_id=data.asset_id,
        requested_by=current_user.user_id,
        origin=data.origin,
        destination=data.destination,
        status="Pending",
        priority=data.priority,
        departure_date=data.departure_date,
        estimated_arrival_date=data.estimated_arrival_date,
        notes=data.notes,
    )
    db.add(logistics_request)
    db.flush()  # gives the new request its id before the audit row is written

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action_type="REQUEST_CREATED",
            table_name="logistics_requests",
            record_id=logistics_request.request_id,
            old_value=None,
            new_value=RequestRead.model_validate(logistics_request).model_dump(mode="json"),
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(logistics_request)
    return logistics_request


@app.patch("/api/requests/{request_id}", response_model=RequestRead)
def update_request_status(
    request_id: int,
    data: RequestUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin", "LogisticsManager")),
):
    logistics_request = db.get(LogisticsRequest, request_id)
    if logistics_request is None:
        raise HTTPException(status_code=404, detail="Request not found")

    # Refuse any status change that is not in the allowed list
    if data.status not in ALLOWED_NEXT_STATUS.get(logistics_request.status, set()):
        raise HTTPException(
            status_code=409,
            detail=f"A {logistics_request.status} request cannot be changed to {data.status}",
        )

    old_value = RequestRead.model_validate(logistics_request).model_dump(mode="json")

    logistics_request.status = data.status
    if data.status == "Approved":
        logistics_request.approved_by = current_user.user_id
    db.flush()  # sends the change now, so the database updates updated_at
    db.refresh(logistics_request)

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action_type=AUDIT_ACTION_FOR_STATUS[data.status],
            table_name="logistics_requests",
            record_id=request_id,
            old_value=old_value,
            new_value=RequestRead.model_validate(logistics_request).model_dump(mode="json"),
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(logistics_request)
    return logistics_request


# ---------- Users (SuperAdmin only) ----------


@app.get("/api/users", response_model=list[UserRead], dependencies=[Depends(require_roles("SuperAdmin"))])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.user_id)).all()


@app.post("/api/users", response_model=UserRead, status_code=201)
def create_user(
    data: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin")),
):
    user = User(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        # Only the bcrypt hash is stored, never the password itself
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
        location=data.location,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action_type="USER_CREATED",
            table_name="users",
            record_id=user.user_id,
            old_value=None,
            new_value=UserRead.model_validate(user).model_dump(mode="json"),
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@app.patch("/api/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin")),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Only the fields the user actually sent are changed
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return user

    # A SuperAdmin cannot remove their own access, so the last admin cannot lock everyone out
    if user.user_id == current_user.user_id:
        removes_own_admin = changes.get("role", "SuperAdmin") != "SuperAdmin"
        deactivates_self = changes.get("is_active", True) is False
        if removes_own_admin or deactivates_self:
            raise HTTPException(
                status_code=409,
                detail="You cannot change your own role or deactivate your own account",
            )

    old_value = UserRead.model_validate(user).model_dump(mode="json")
    for field, value in changes.items():
        setattr(user, field, value)
    db.flush()  # sends the change now, so the database updates updated_at
    db.refresh(user)
    new_value = UserRead.model_validate(user).model_dump(mode="json")

    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action_type="USER_UPDATED",
            table_name="users",
            record_id=user_id,
            old_value=old_value,
            new_value=new_value,
            ip_address=request.client.host if request.client else None,
        )
    )
    db.commit()
    db.refresh(user)
    return user


# ---------- Recent activity (every logged-in user) ----------


@app.get("/api/activity", response_model=list[ActivityItem], dependencies=[Depends(get_current_user)])
def recent_activity(limit: int = Query(default=15, ge=1, le=50), db: Session = Depends(get_db)):
    # A safe summary of the newest audit rows, for the dashboard feed. It shows who did what and to
    # which record, but never stored values, email addresses or IP addresses.
    # The full audit log stays SuperAdmin only.
    actor = aliased(User)
    rows = db.execute(
        select(AuditLog, actor.first_name, actor.last_name)
        .outerjoin(actor, actor.user_id == AuditLog.user_id)
        .order_by(AuditLog.log_id.desc())
        .limit(limit)
    ).all()

    return [
        ActivityItem(
            log_id=log.log_id,
            action_type=log.action_type,
            table_name=log.table_name,
            record_id=log.record_id,
            actor_name=f"{first_name} {last_name}" if first_name is not None else None,
            target_label=activity_target(log),
            detail=activity_detail(log),
            created_at=log.created_at,
        )
        for log, first_name, last_name in rows
    ]


# ---------- Audit log (SuperAdmin only) ----------


@app.get(
    "/api/audit-logs",
    response_model=list[AuditLogRead],
    dependencies=[Depends(require_roles("SuperAdmin"))],
)
def list_audit_logs(
    table_name: str | None = None,
    user_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    # Newest first. This route only reads the log. It never changes or deletes a row.
    query = select(AuditLog).order_by(AuditLog.log_id.desc())
    if table_name is not None:
        query = query.where(AuditLog.table_name == table_name)
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    return db.scalars(query.limit(limit).offset(offset)).all()
