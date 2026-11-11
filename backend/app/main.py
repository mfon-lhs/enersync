from fastapi import Depends, FastAPI, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import create_access_token, verify_password
from app.models.asset import Asset
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.schemas.auth import LoginRequest, TokenResponse

app = FastAPI(title="Enersync API", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.email == data.email)).first()

    # Use the same message for an unknown email and a wrong password,
    # so nobody can use this form to find out which emails exist
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Wrong email or password")
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")

    return TokenResponse(access_token=create_access_token(user.user_id))


@app.get(
    "/api/assets",
    response_model=list[AssetRead],
    dependencies=[Depends(get_current_user)],
)
def list_assets(db: Session = Depends(get_db)):
    return db.scalars(select(Asset).order_by(Asset.asset_id)).all()


@app.get(
    "/api/assets/{asset_id}",
    response_model=AssetRead,
    dependencies=[Depends(get_current_user)],
)
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
        db.flush()  # Sends the INSERT now, without saving it yet, so the asset gets its ID
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An asset with this tag already exists")

    # The audit entry goes into the same save as the asset, so both are saved or neither is
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
        return asset  # Nothing to change, so nothing to save or log

    old_value = AssetRead.model_validate(asset).model_dump(mode="json")
    for field, value in changes.items():
        setattr(asset, field, value)
    new_value = AssetRead.model_validate(asset).model_dump(mode="json")

    # The audit entry goes into the same save as the change, so both are saved or neither is
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