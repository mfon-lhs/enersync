from getpass import getpass

from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.security import hash_password

# The demo users created by database/schema.sql and database/demo_data.sql.
# Emails that are not in the database are skipped, so this is safe to run with only schema.sql loaded.
DEMO_EMAILS = [
    "i.nwosu@enersync.corp",  # SuperAdmin
    "a.bello@enersync.corp",  # LogisticsManager
    "e.okon@enersync.corp",  # FieldTechnician
    "t.adebayo@enersync.corp",  # Viewer
]


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

    print("Done. Every demo user in the database now has a real password hash.")


if __name__ == "__main__":
    main()