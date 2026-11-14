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


# ---------- Command center fields ----------


def test_asset_can_be_created_with_the_command_center_fields(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset = new_asset(
        capacity_value=500,
        capacity_unit="kVA",
        utilization_pct=64.5,
        is_critical=True,
        inspection_interval_days=45,
        latitude=4.8156,
        longitude=7.0498,
    )

    response = client.post("/api/assets", json=asset, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["capacity_value"] == 500
    assert body["capacity_unit"] == "kVA"
    assert body["utilization_pct"] == 64.5
    assert body["is_critical"] is True
    assert body["inspection_interval_days"] == 45
    assert body["latitude"] == 4.8156
    assert body["longitude"] == 7.0498


def test_new_asset_gets_default_values(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")

    body = client.post("/api/assets", json=new_asset(), headers=headers).json()

    assert body["utilization_pct"] == 0
    assert body["is_critical"] is False
    assert body["inspection_interval_days"] == 90
    assert body["capacity_value"] is None
    assert body["latitude"] is None


def test_coordinates_must_come_as_a_pair(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    response = client.post("/api/assets", json=new_asset(latitude=4.8), headers=headers)
    assert response.status_code == 422


def test_utilization_must_be_between_0_and_100(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    response = client.post("/api/assets", json=new_asset(utilization_pct=101), headers=headers)
    assert response.status_code == 422


def test_update_cannot_leave_half_a_coordinate_pair(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = client.post("/api/assets", json=new_asset(), headers=headers).json()["asset_id"]

    response = client.patch(f"/api/assets/{asset_id}", json={"latitude": 4.8}, headers=headers)

    assert response.status_code == 422
    # Nothing was saved
    assert client.get(f"/api/assets/{asset_id}", headers=headers).json()["latitude"] is None


def test_update_can_set_both_coordinates(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = client.post("/api/assets", json=new_asset(), headers=headers).json()["asset_id"]

    response = client.patch(
        f"/api/assets/{asset_id}",
        json={"latitude": 4.8156, "longitude": 7.0498},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["latitude"] == 4.8156
    assert response.json()["longitude"] == 7.0498


def test_update_cannot_set_utilization_to_null(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = client.post("/api/assets", json=new_asset(), headers=headers).json()["asset_id"]

    response = client.patch(f"/api/assets/{asset_id}", json={"utilization_pct": None}, headers=headers)

    assert response.status_code == 422


# ---------- Paging ----------


def test_asset_list_can_be_paged_and_reports_its_total(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")
    for number in (1, 2, 3):
        client.post(
            "/api/assets",
            json=new_asset(asset_tag=f"ENS-PH-PUMP-00{number}"),
            headers=headers,
        )

    first_page = client.get("/api/assets?limit=2", headers=headers)
    second_page = client.get("/api/assets?limit=2&skip=2", headers=headers)
    everything = client.get("/api/assets", headers=headers)

    assert len(first_page.json()) == 2
    assert first_page.headers["x-total-count"] == "3"
    assert [asset["asset_tag"] for asset in second_page.json()] == ["ENS-PH-PUMP-003"]
    assert len(everything.json()) == 3


def test_asset_limit_must_be_between_1_and_500(client, auth_headers):
    headers = auth_headers("viewer@enersync.corp", role="Viewer")

    assert client.get("/api/assets?limit=0", headers=headers).status_code == 422
    assert client.get("/api/assets?limit=501", headers=headers).status_code == 422
    assert client.get("/api/assets?skip=-1", headers=headers).status_code == 422
