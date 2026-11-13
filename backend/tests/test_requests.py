def create_asset(client, headers):
    # Creates an asset and returns its asset_id
    response = client.post(
        "/api/assets",
        json={
            "asset_tag": "ENS-PH-GEN-001",
            "name": "Test Generator",
            "category": "Power Systems",
            "current_location": "Port Harcourt Hub",
        },
        headers=headers,
    )
    return response.json()["asset_id"]


def raise_request(client, headers, asset_id):
    # Raises a request to move the asset, and returns the response
    return client.post(
        "/api/requests",
        json={
            "asset_id": asset_id,
            "origin": "Port Harcourt Hub",
            "destination": "Obagi Field Location",
        },
        headers=headers,
    )


def change_status(client, headers, request_id, status):
    # Approves, rejects or completes a request, and returns the response
    return client.patch(f"/api/requests/{request_id}", json={"status": status}, headers=headers)


def test_field_technician_can_raise_a_request(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")

    response = raise_request(client, tech, asset_id)

    assert response.status_code == 201
    assert response.json()["status"] == "Pending"


def test_viewer_cannot_raise_a_request(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    viewer = auth_headers("viewer@enersync.corp", role="Viewer")

    response = raise_request(client, viewer, asset_id)

    assert response.status_code == 403


def test_request_for_unknown_asset_is_refused(client, auth_headers):
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")

    response = raise_request(client, tech, asset_id=999)

    assert response.status_code == 404


def test_manager_can_approve_a_pending_request(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")
    request_id = raise_request(client, tech, asset_id).json()["request_id"]

    response = change_status(client, manager, request_id, "Approved")

    assert response.status_code == 200
    assert response.json()["status"] == "Approved"


def test_field_technician_cannot_approve_a_request(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")
    request_id = raise_request(client, tech, asset_id).json()["request_id"]

    response = change_status(client, tech, request_id, "Approved")

    assert response.status_code == 403


def test_pending_request_cannot_skip_to_completed(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")
    request_id = raise_request(client, tech, asset_id).json()["request_id"]

    response = change_status(client, manager, request_id, "Completed")

    assert response.status_code == 409


def test_rejected_request_cannot_be_approved_later(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")
    request_id = raise_request(client, tech, asset_id).json()["request_id"]
    change_status(client, manager, request_id, "Rejected")

    response = change_status(client, manager, request_id, "Approved")

    assert response.status_code == 409


def test_request_moves_from_pending_to_approved_to_completed(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")
    request_id = raise_request(client, tech, asset_id).json()["request_id"]
    change_status(client, manager, request_id, "Approved")

    response = change_status(client, manager, request_id, "Completed")

    assert response.status_code == 200
    assert response.json()["status"] == "Completed"


def test_approving_a_request_writes_an_audit_row(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")
    request_id = raise_request(client, tech, asset_id).json()["request_id"]
    change_status(client, manager, request_id, "Approved")

    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    logs = client.get("/api/audit-logs?table_name=logistics_requests", headers=admin).json()
    assert [log["action_type"] for log in logs] == ["REQUEST_APPROVED", "REQUEST_CREATED"]
