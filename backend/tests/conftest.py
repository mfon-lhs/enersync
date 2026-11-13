import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User

# The tests use a separate database called enersync_test, so they never change your real data.
TEST_DATABASE_URL = settings.database_url.rsplit("/", 1)[0] + "/enersync_test"

test_engine = create_engine(TEST_DATABASE_URL)
TestSession = sessionmaker(bind=test_engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


# While the tests run, every request uses the test database
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def empty_tables():
    # Before each test, delete all rows, so every test starts from nothing
    with test_engine.begin() as connection:
        connection.execute(
            text("TRUNCATE users, assets, logistics_requests, audit_logs RESTART IDENTITY CASCADE")
        )
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user():
    # Creates a user in the test database and returns their user_id
    def _make_user(email, role="SuperAdmin", password="test-password-1", is_active=True):
        with TestSession() as db:
            user = User(
                first_name="Test",
                last_name="User",
                email=email,
                password_hash=hash_password(password),
                role=role,
                is_active=is_active,
                location="Abuja HQ",
            )
            db.add(user)
            db.commit()
            return user.user_id

    return _make_user

@pytest.fixture
def auth_headers(client, make_user):
    # Creates a user with the given role, logs in, and returns the header that proves who they are
    def _auth_headers(email, role="SuperAdmin", password="test-password-1"):
        make_user(email, role=role, password=password)
        response = client.post("/api/auth/login", json={"email": email, "password": password})
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _auth_headers