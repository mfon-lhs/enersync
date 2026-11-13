def new_asset(**changes):
    # A valid asset. Pass keyword arguments to change any of its fields
    asset = {
        "asset_tag": "ENS-PH-PUMP-001",
        "name": "Test Pump",
        "category": "Power Systems",
        "current_location": "Port Harcourt Hub",
    }
    asset.update(changes)
    return asset


def test_assets_need_a_login(client):
    response = client.get("/api/assets")
    assert response.status_code == 401


def test_viewer_can_read_assets(client, auth_headers):
    headers = auth_headers("viewer@enersync.corp", role="Viewer")
    response = client.get("/api/assets", headers=headers)
    assert response.status_code == 200


def test_field_technician_cannot_create_an_asset(client, auth_headers):
    headers = auth_headers("tech@enersync.corp", role="FieldTechnician")
    response = client.post("/api/assets", json=new_asset(), headers=headers)
    assert response.status_code == 403


def test_logistics_manager_can_create_an_asset(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    response = client.post("/api/assets", json=new_asset(), headers=headers)
    assert response.status_code == 201
    assert response.json()["asset_tag"] == "ENS-PH-PUMP-001"


def test_duplicate_asset_tag_is_refused(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    client.post("/api/assets", json=new_asset(), headers=headers)
    response = client.post("/api/assets", json=new_asset(), headers=headers)
    assert response.status_code == 409


def test_asset_tag_must_start_with_ens(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    response = client.post("/api/assets", json=new_asset(asset_tag="PUMP-001"), headers=headers)
    assert response.status_code == 422


def test_creating_an_asset_writes_an_audit_row(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    client.post("/api/assets", json=new_asset(), headers=headers)

    admin_headers = auth_headers("admin@enersync.corp", role="SuperAdmin")
    logs = client.get("/api/audit-logs?table_name=assets", headers=admin_headers).json()
    assert [log["action_type"] for log in logs] == ["ASSET_CREATED"]


def test_updating_an_asset_records_old_and_new_values(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = client.post("/api/assets", json=new_asset(), headers=headers).json()["asset_id"]

    response = client.patch(
        f"/api/assets/{asset_id}",
        json={"status": "MaintenanceRequired"},
        headers=headers,
    )
    assert response.status_code == 200

    admin_headers = auth_headers("admin@enersync.corp", role="SuperAdmin")
    logs = client.get("/api/audit-logs?table_name=assets", headers=admin_headers).json()
    newest = logs[0]  # the audit log is newest first
    assert newest["action_type"] == "ASSET_UPDATED"
    assert newest["old_value"]["status"] == "Operational"
    assert newest["new_value"]["status"] == "MaintenanceRequired"
