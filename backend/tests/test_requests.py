def create_asset(client, headers, **changes):
    # Creates an asset and returns its asset_id. Pass keyword arguments to change any field,
    # such as latitude=4.8 and longitude=7.0.
    body = {
        "asset_tag": "ENS-PH-GEN-001",
        "name": "Test Generator",
        "category": "Power Systems",
        "current_location": "Port Harcourt Hub",
    }
    body.update(changes)
    response = client.post("/api/assets", json=body, headers=headers)
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


# ---------- Completing a request moves the asset ----------


def complete_a_request(client, manager, asset_id, **request_changes):
    # Raises, approves and completes a request. Returns the request_id.
    request_id = raise_request(client, manager, asset_id, **request_changes).json()["request_id"]
    change_status(client, manager, request_id, "Approved")
    change_status(client, manager, request_id, "Completed")
    return request_id


def test_completing_a_request_moves_the_asset_to_the_destination(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)

    complete_a_request(client, manager, asset_id)

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["current_location"] == "Obagi Field Location"


def test_approving_a_request_does_not_move_the_asset_yet(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    request_id = raise_request(client, manager, asset_id).json()["request_id"]

    change_status(client, manager, request_id, "Approved")

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["current_location"] == "Port Harcourt Hub"


def test_rejecting_a_request_does_not_move_the_asset(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    request_id = raise_request(client, manager, asset_id).json()["request_id"]

    change_status(client, manager, request_id, "Rejected")

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["current_location"] == "Port Harcourt Hub"


def test_an_in_transit_asset_is_operational_again_when_the_request_completes(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    client.patch(f"/api/assets/{asset_id}", json={"status": "InTransit"}, headers=manager)

    complete_a_request(client, manager, asset_id)

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["status"] == "Operational"


def test_an_asset_needing_maintenance_keeps_that_status_after_the_move(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    client.patch(f"/api/assets/{asset_id}", json={"status": "MaintenanceRequired"}, headers=manager)

    complete_a_request(client, manager, asset_id)

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["status"] == "MaintenanceRequired"
    assert asset["current_location"] == "Obagi Field Location"


def test_the_old_map_position_is_cleared_when_the_asset_moves(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager, latitude=4.8156, longitude=7.0498)

    complete_a_request(client, manager, asset_id)

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["latitude"] is None
    assert asset["longitude"] is None


def test_the_map_position_is_kept_if_the_asset_is_already_at_the_destination(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager, latitude=4.8156, longitude=7.0498)

    complete_a_request(client, manager, asset_id, destination="Port Harcourt Hub")

    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["latitude"] == 4.8156
    assert asset["longitude"] == 7.0498


def test_the_move_is_recorded_in_the_audit_log_with_old_and_new_values(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    complete_a_request(client, manager, asset_id)

    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    logs = client.get("/api/audit-logs?table_name=assets", headers=admin).json()

    newest = logs[0]  # the audit log is newest first
    assert newest["action_type"] == "ASSET_UPDATED"
    assert newest["record_id"] == asset_id
    assert newest["old_value"]["current_location"] == "Port Harcourt Hub"
    assert newest["new_value"]["current_location"] == "Obagi Field Location"


def test_no_asset_audit_row_is_written_if_nothing_about_the_asset_changed(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    complete_a_request(client, manager, asset_id, destination="Port Harcourt Hub")

    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    logs = client.get("/api/audit-logs?table_name=assets", headers=admin).json()

    assert [log["action_type"] for log in logs] == ["ASSET_CREATED"]


def test_a_request_cannot_be_completed_if_the_asset_was_decommissioned_meanwhile(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    request_id = raise_request(client, manager, asset_id).json()["request_id"]
    change_status(client, manager, request_id, "Approved")
    client.patch(f"/api/assets/{asset_id}", json={"status": "Decommissioned"}, headers=manager)

    response = change_status(client, manager, request_id, "Completed")

    assert response.status_code == 409
    # Nothing changed: the request is still Approved and the asset did not move
    request = next(
        r for r in client.get("/api/requests", headers=manager).json() if r["request_id"] == request_id
    )
    assert request["status"] == "Approved"
    asset = client.get(f"/api/assets/{asset_id}", headers=manager).json()
    assert asset["current_location"] == "Port Harcourt Hub"
