# Enersync frontend

The web app for Enersync: a dark "command center" built with React, Vite, Recharts and Lucide icons.
Enersync is an independent portfolio project. It is not affiliated with any energy company, and all data is fictional.

## Run it

1. Start the backend (from the `backend` folder, with the virtual environment active):
   `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
2. In this `frontend` folder, install once, then start:
   `npm install`
   `npm run dev`
3. Open http://localhost:5173

The backend allows calls only from `http://localhost:5173` and `http://127.0.0.1:5173`, so the dev server is set to keep exactly port 5173.

## Where things are

| Folder / file | What it is |
| --- | --- |
| `src/theme.js` | The ONE place for colours and fonts. Change a value here and the whole app follows. |
| `src/api/client.js` | Every call to the API. Adds the login token, and signs you out on a 401 answer. |
| `src/auth/` | Login state, and what each role may do (`roles.js` mirrors the backend rules). |
| `src/pages/` | One file per screen: login, dashboard, assets, requests, audit log, users. |
| `src/components/` | Shared pieces: dialogs, badges, forms, layout. |
| `src/styles/` | The CSS. It uses only the variables that `theme.js` sets. |

## If the backend is somewhere else

Copy `.env.example` to `.env` and change `VITE_API_URL`. The backend must also allow that origin (CORS).
