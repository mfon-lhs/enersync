def test_correct_password_gets_a_token(client, make_user):
    make_user("admin@enersync.corp", password="test-password-1")

    response = client.post(
        "/api/auth/login",
        json={"email": "admin@enersync.corp", "password": "test-password-1"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_wrong_password_is_refused(client, make_user):
    make_user("admin@enersync.corp", password="test-password-1")

    response = client.post(
        "/api/auth/login",
        json={"email": "admin@enersync.corp", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_inactive_user_cannot_log_in(client, make_user):
    make_user("former@enersync.corp", is_active=False)

    response = client.post(
        "/api/auth/login",
        json={"email": "former@enersync.corp", "password": "test-password-1"},
    )

    assert response.status_code == 401
