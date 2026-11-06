from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.asset import Asset
from app.schemas.asset import AssetRead

app = FastAPI(title="Enersync API", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/assets", response_model=list[AssetRead])
def list_assets(db: Session = Depends(get_db)):
    return db.scalars(select(Asset).order_by(Asset.asset_id)).all()


@app.get("/api/assets/{asset_id}", response_model=AssetRead)
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset