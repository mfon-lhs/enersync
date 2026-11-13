def new_user(**changes):
    # A valid new user. Pass keyword arguments to change any of its fields
    user = {
        "first_name": "Ada",
        "last_name": "Obi",
        "email": "ada@enersync.corp",
        "password": "a-strong-password",
        "role": "FieldTechnician",
        "location": "Abuja HQ",
    }
    user.update(changes)
    return user


def test_only_superadmin_can_list_users(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")

    assert client.get("/api/users", headers=manager).status_code == 403
    assert client.get("/api/users", headers=admin).status_code == 200


def test_superadmin_creates_a_user_without_returning_a_password(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")

    response = client.post("/api/users", json=new_user(), headers=admin)

    assert response.status_code == 201
    assert response.json()["email"] == "ada@enersync.corp"
    assert "password" not in response.json()
    assert "password_hash" not in response.json()


def test_manager_cannot_create_a_user(client, auth_headers):
    manager = auth_headers("manager@enersync.corp", role="LogisticsManager")

    response = client.post("/api/users", json=new_user(), headers=manager)

    assert response.status_code == 403


def test_short_password_is_refused(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")

    response = client.post("/api/users", json=new_user(password="short"), headers=admin)

    assert response.status_code == 422


def test_duplicate_email_is_refused(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    client.post("/api/users", json=new_user(), headers=admin)

    response = client.post("/api/users", json=new_user(), headers=admin)

    assert response.status_code == 409


def test_creating_a_user_writes_an_audit_row_without_the_password(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    client.post("/api/users", json=new_user(), headers=admin)

    logs = client.get("/api/audit-logs?table_name=users", headers=admin).json()

    assert logs[0]["action_type"] == "USER_CREATED"
    assert logs[0]["new_value"]["email"] == "ada@enersync.corp"
    assert "password_hash" not in logs[0]["new_value"]


def test_deactivated_user_cannot_log_in(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    user_id = client.post("/api/users", json=new_user(), headers=admin).json()["user_id"]

    response = client.patch(f"/api/users/{user_id}", json={"is_active": False}, headers=admin)
    assert response.status_code == 200

    login = client.post(
        "/api/auth/login",
        json={"email": "ada@enersync.corp", "password": "a-strong-password"},
    )
    assert login.status_code == 401


def test_superadmin_cannot_deactivate_or_demote_themselves(client, auth_headers):
    admin = auth_headers("admin@enersync.corp", role="SuperAdmin")
    # The admin is the only user in the test database, so they are the first one listed
    my_id = client.get("/api/users", headers=admin).json()[0]["user_id"]

    deactivate = client.patch(f"/api/users/{my_id}", json={"is_active": False}, headers=admin)
    demote = client.patch(f"/api/users/{my_id}", json={"role": "Viewer"}, headers=admin)

    assert deactivate.status_code == 409
    assert demote.status_code == 409
