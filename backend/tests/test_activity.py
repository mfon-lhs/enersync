def create_asset(client, headers, tag="ENS-PH-GEN-001"):
    # Creates an asset and returns its asset_id
    response = client.post(
        "/api/assets",
        json={
            "asset_tag": tag,
            "name": "Test Generator",
            "category": "Power Systems",
            "current_location": "Port Harcourt Hub",
        },
        headers=headers,
    )
    return response.json()["asset_id"]


def test_activity_needs_a_login(client):
    assert client.get("/api/activity").status_code == 401


def test_every_role_can_read_the_activity_feed(client, auth_headers):
    for number, role in enumerate(["SuperAdmin", "LogisticsManager", "FieldTechnician", "Viewer"]):
        headers = auth_headers(f"user{number}@enersync.corp", role=role)
        assert client.get("/api/activity", headers=headers).status_code == 200


def test_activity_shows_who_did_what_without_private_details(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    create_asset(client, manager)
    viewer = auth_headers("viewer@enersync.corp", role="Viewer")

    items = client.get("/api/activity", headers=viewer).json()

    assert len(items) == 1
    item = items[0]
    assert item["action_type"] == "ASSET_CREATED"
    assert item["table_name"] == "assets"
    assert item["target_label"] == "ENS-PH-GEN-001"
    assert item["actor_name"] == "Test User"
    for private_field in ("old_value", "new_value", "ip_address", "user_id"):
        assert private_field not in item


def test_activity_is_newest_first_and_can_be_limited(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    for number in (1, 2, 3):
        create_asset(client, manager, tag=f"ENS-PH-GEN-00{number}")

    items = client.get("/api/activity?limit=2", headers=manager).json()

    assert [item["target_label"] for item in items] == [
        "ENS-PH-GEN-003",
        "ENS-PH-GEN-002",
    ]


def test_activity_limit_must_be_between_1_and_50(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")

    assert client.get("/api/activity?limit=0", headers=manager).status_code == 422
    assert client.get("/api/activity?limit=51", headers=manager).status_code == 422


def test_activity_names_the_fields_that_changed_but_not_their_values(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    client.patch(
        f"/api/assets/{asset_id}",
        json={"status": "MaintenanceRequired"},
        headers=manager,
    )

    newest = client.get("/api/activity", headers=manager).json()[0]

    assert newest["action_type"] == "ASSET_UPDATED"
    assert newest["detail"] == "Changed status"
    assert "MaintenanceRequired" not in str(newest)


def test_activity_for_a_request_shows_the_route(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    asset_id = create_asset(client, manager)
    client.post(
        "/api/requests",
        json={
            "asset_id": asset_id,
            "origin": "Port Harcourt Hub",
            "destination": "Obagi Field Location",
        },
        headers=manager,
    )

    newest = client.get("/api/activity", headers=manager).json()[0]

    assert newest["action_type"] == "REQUEST_CREATED"
    assert newest["detail"] == "Port Harcourt Hub to Obagi Field Location"


def test_activity_for_a_user_never_shows_the_email_address(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    client.post(
        "/api/users",
        json={
            "first_name": "Ada",
            "last_name": "Obi",
            "email": "ada@enersync.corp",
            "password": "a-strong-password",
            "role": "FieldTechnician",
            "location": "Abuja HQ",
        },
        headers=admin,
    )

    newest = client.get("/api/activity", headers=admin).json()[0]

    assert newest["action_type"] == "USER_CREATED"
    assert newest["target_label"] == "Ada Obi"
    assert "ada@enersync.corp" not in str(newest)
