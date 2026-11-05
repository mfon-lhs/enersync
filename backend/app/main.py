from fastapi import FastAPI, HTTPException

app = FastAPI(title="Enersync API", version="0.1.0")

# Temporary fictional data. The database replaces this list in the next stage.
ASSETS = [
    {
        "asset_id": 1,
        "asset_tag": "ENS-PH-GEN-001",
        "name": "Caterpillar 500kVA Generator",
        "category": "Power Systems",
        "status": "Operational",
        "current_location": "Port Harcourt Hub",
    },
    {
        "asset_id": 2,
        "asset_tag": "ENS-ABJ-FLEET-12",
        "name": "Toyota Hilux 4x4 Escort",
        "category": "Logistics Fleet",
        "status": "MaintenanceRequired",
        "current_location": "Abuja HQ",
    },
]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/assets")
def list_assets():
    return ASSETS


@app.get("/api/assets/{asset_id}")
def get_asset(asset_id: int):
    for asset in ASSETS:
        if asset["asset_id"] == asset_id:
            return asset
    raise HTTPException(status_code=404, detail="Asset not found")