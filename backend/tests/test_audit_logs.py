def create_asset(client, headers, tag):
    # Creates an asset with the given tag
    client.post(
        "/api/assets",
        json={
            "asset_tag": tag,
            "name": "Test Generator",
            "category": "Power Systems",
            "current_location": "Port Harcourt Hub",
        },
        headers=headers,
    )


def test_audit_log_needs_a_login(client):
    response = client.get("/api/audit-logs")
    assert response.status_code == 401


def test_only_superadmin_can_read_the_audit_log(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")

    assert client.get("/api/audit-logs", headers=manager).status_code == 403
    assert client.get("/api/audit-logs", headers=admin).status_code == 200


def test_table_filter_shows_only_that_table(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    create_asset(client, manager, "ENS-PH-GEN-001")
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

    logs = client.get("/api/audit-logs?table_name=users", headers=admin).json()

    assert len(logs) == 1
    assert all(log["table_name"] == "users" for log in logs)


def test_limit_must_be_between_1_and_200(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")

    assert client.get("/api/audit-logs?limit=0", headers=admin).status_code == 422
    assert client.get("/api/audit-logs?limit=201", headers=admin).status_code == 422


def test_limit_and_offset_page_through_the_log(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    create_asset(client, manager, "ENS-PH-GEN-001")
    create_asset(client, manager, "ENS-PH-GEN-002")
    create_asset(client, manager, "ENS-PH-GEN-003")

    first_page = client.get("/api/audit-logs?limit=2", headers=admin).json()
    second_page = client.get("/api/audit-logs?limit=2&offset=2", headers=admin).json()

    assert len(first_page) == 2
    assert len(second_page) == 1
