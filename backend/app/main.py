from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.models.asset import Asset
from app.models.user import User
from app.schemas.asset import AssetRead
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