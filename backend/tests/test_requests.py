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


def raise_request(client, headers, asset_id, **changes):
    # Raises a request to move the asset, and returns the response.
    # Pass keyword arguments to change or add fields, such as priority="High".
    body = {
        "asset_id": asset_id,
        "origin": "Port Harcourt Hub",
        "destination": "Obagi Field Location",
    }
    body.update(changes)
    return client.post("/api/requests", json=body, headers=headers)


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
    assert [log["action_type"] for log in logs] == [
        "REQUEST_APPROVED",
        "REQUEST_CREATED",
    ]


# ---------- Priority and new rules ----------


def test_new_request_defaults_to_normal_priority(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)

    response = raise_request(client, manager, asset_id)

    assert response.json()["priority"] == "Normal"


def test_request_can_be_raised_with_a_priority(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)

    response = raise_request(client, manager, asset_id, priority="Critical")

    assert response.status_code == 201
    assert response.json()["priority"] == "Critical"


def test_unknown_priority_is_refused(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)

    response = raise_request(client, manager, asset_id, priority="Urgent")

    assert response.status_code == 422


def test_arrival_cannot_be_before_departure(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)

    response = raise_request(
        client,
        manager,
        asset_id,
        departure_date="2026-12-02T08:00:00Z",
        estimated_arrival_date="2026-12-01T08:00:00Z",
    )

    assert response.status_code == 422


def test_decommissioned_asset_cannot_be_moved(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    client.patch(f"/api/assets/{asset_id}", json={"status": "Decommissioned"}, headers=manager)
    tech = auth_headers("tech@enersync.corp", role="FieldTechnician")

    response = raise_request(client, tech, asset_id)

    assert response.status_code == 409


# ---------- The request list ----------


def test_request_list_needs_a_login(client):
    assert client.get("/api/requests").status_code == 401


def test_request_list_is_newest_first_with_names_and_a_total(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    first = raise_request(client, manager, asset_id).json()["request_id"]
    second = raise_request(client, manager, asset_id).json()["request_id"]

    response = client.get("/api/requests", headers=manager)

    body = response.json()
    assert [item["request_id"] for item in body] == [second, first]
    assert response.headers["x-total-count"] == "2"
    assert body[0]["asset_tag"] == "ENS-PH-GEN-001"
    assert body[0]["asset_name"] == "Test Generator"
    assert body[0]["requested_by_name"] == "Test User"
    assert body[0]["approved_by_name"] is None


def test_request_list_names_the_approver(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    request_id = raise_request(client, manager, asset_id).json()["request_id"]
    change_status(client, manager, request_id, "Approved")

    body = client.get("/api/requests", headers=manager).json()

    assert body[0]["approved_by_name"] == "Test User"


def test_request_list_can_be_paged(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    first = raise_request(client, manager, asset_id).json()["request_id"]
    second = raise_request(client, manager, asset_id).json()["request_id"]

    newest = client.get("/api/requests?limit=1", headers=manager).json()
    older = client.get("/api/requests?limit=1&skip=1", headers=manager).json()

    assert [item["request_id"] for item in newest] == [second]
    assert [item["request_id"] for item in older] == [first]
    assert client.get("/api/requests?limit=0", headers=manager).status_code == 422
