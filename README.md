# Enersync

An independent portfolio project: a tracker for energy-operations assets and logistics requests.
It is not affiliated with any company. All data is fictional.

## Run it with Docker

You need Docker Desktop. One command starts the database, the API and the web app.

1. Copy `.env.example` to `.env` and fill in the three values (see the comments inside).
2. Stop anything else using ports 5173 or 8000 (such as `npm run dev` or `uvicorn`).
3. From this folder, run:

   ```powershell
   docker compose up --build
   ```

4. In a second terminal, give the demo users a password (you choose it):

   ```powershell
   docker compose exec backend python -m scripts.set_demo_passwords
   ```

5. Open http://localhost:5173 and log in as `i.nwosu@enersync.corp` (SuperAdmin), `a.bello@enersync.corp` (Logistics Manager), `e.okon@enersync.corp` (Field Technician) or `t.adebayo@enersync.corp` (Viewer).

The API documentation is at http://localhost:8000/docs.
To stop everything, press `Ctrl + C`. To delete the database too and start fresh, run `docker compose down -v`.

More detail on the design is in `docs/design.md`.
