from getpass import getpass

from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.security import hash_password

# The two demo users created by database/schema.sql
DEMO_EMAILS = ["a.bello@enersync.corp", "e.okon@enersync.corp"]


def main() -> None:
    password = getpass("Choose a demo password (at least 8 characters): ")
    if len(password) < 8:
        raise SystemExit("The password must be at least 8 characters.")

    # Save only the hash, never the password itself
    password_hash = hash_password(password)

    db = SessionLocal()
    try:
        for email in DEMO_EMAILS:
            db.execute(
                text("UPDATE users SET password_hash = :pw_hash WHERE email = :email"),
                {"pw_hash": password_hash, "email": email},
            )
        db.commit()
    finally:
        db.close()

    print("Done. Both demo users now have a real password hash.")


if __name__ == "__main__":
    main()