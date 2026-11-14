from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings


def make_token(payload, secret=None):
    # Signs a token with the real secret (or another one), so a test can build good and bad tokens
    return jwt.encode(payload, secret or settings.jwt_secret_key, algorithm="HS256")


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


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


def test_me_returns_the_logged_in_user(client, auth_headers):
    headers = auth_headers("manager@enersync.corp", role="LogisticsManager")

    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "manager@enersync.corp"
    assert body["role"] == "LogisticsManager"
    assert body["location"] == "Abuja HQ"
    assert "password_hash" not in body


def test_me_needs_a_login_and_asks_for_a_bearer_token(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_garbage_token_is_refused(client):
    response = client.get("/api/auth/me", headers=bearer("not-a-real-token"))

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_token_is_refused(client, make_user):
    user_id = make_user("admin@enersync.corp")
    expired = datetime.now(timezone.utc) - timedelta(minutes=1)

    response = client.get(
        "/api/auth/me",
        headers=bearer(make_token({"sub": str(user_id), "exp": expired})),
    )

    assert response.status_code == 401


def test_token_without_an_expiry_is_refused(client, make_user):
    user_id = make_user("admin@enersync.corp")

    response = client.get("/api/auth/me", headers=bearer(make_token({"sub": str(user_id)})))

    assert response.status_code == 401


def test_token_signed_with_another_secret_is_refused(client, make_user):
    user_id = make_user("admin@enersync.corp")
    later = datetime.now(timezone.utc) + timedelta(minutes=5)
    forged = make_token(
        {"sub": str(user_id), "exp": later},
        secret="a-different-secret-that-is-long-enough",
    )

    response = client.get("/api/auth/me", headers=bearer(forged))

    assert response.status_code == 401


def test_valid_token_of_a_deactivated_user_is_refused(client, make_user):
    user_id = make_user("former@enersync.corp", is_active=False)
    later = datetime.now(timezone.utc) + timedelta(minutes=5)

    response = client.get("/api/auth/me", headers=bearer(make_token({"sub": str(user_id), "exp": later})))

    assert response.status_code == 401
