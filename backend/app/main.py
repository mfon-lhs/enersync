from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import create_access_token, verify_password
from app.models.asset import Asset
from app.models.audit_log import AuditLog
from app.models.logistics_request import LogisticsRequest
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetRead, AssetSummary, AssetUpdate
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.logistics_request import RequestCreate, RequestRead, RequestUpdate

app = FastAPI(title="Enersync API", version="0.1.0")

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
def list_assets(db: Session = Depends(get_db)):
    return db.scalars(select(Asset).order_by(Asset.asset_id)).all()


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


@app.get("/api/requests", response_model=list[RequestRead], dependencies=[Depends(get_current_user)])
def list_requests(db: Session = Depends(get_db)):
    return db.scalars(select(LogisticsRequest).order_by(LogisticsRequest.request_id)).all()


@app.post("/api/requests", response_model=RequestRead, status_code=201)
def create_request(
    data: RequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("SuperAdmin", "LogisticsManager", "FieldTechnician")),
):
    # A request can only be raised for an asset that exists
    if db.get(Asset, data.asset_id) is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    logistics_request = LogisticsRequest(
        asset_id=data.asset_id,
        requested_by=current_user.user_id,
        origin=data.origin,
        destination=data.destination,
        status="Pending",
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