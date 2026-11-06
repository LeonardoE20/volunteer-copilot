# Volunteer Copilot frontend

React + TypeScript + Vite, isolated in `frontend/` so teammates can keep working on the existing backend. The frontend preserves the FastAPI, database, and Chert implementation.

## Run

Use Node 24 (Node 22.12+ also supports this Vite version):

```sh
cd frontend
npm install
npm run dev
```

Open the printed address, normally `http://127.0.0.1:5173/`.

```sh
npm test
npm run build
```

## What works locally

- Two sample events, six editable role presets, roster counts, event creation, and a reusable volunteer signup sheet.
- Event-specific participation, standby lists, name/status/role filters, and adding people from the directory.
- Message composition, explicit recipient selection/review, timing presets, and a simulated campaign queue.
- A sample YES reply, recipient-specific form, availability/preferences submission, and capacity/overlap-checked assignment confirmation.
- Kivo: a real Three.js character with a wave/camera move, contextual walkthroughs, quiet mode, reduced motion, and a fallback when 3D is unavailable.
- Responsive layouts, native accessible dialogs, form validation, empty/loading/error states, and cross-tab refresh.

## Demo limits

All people and events are sample records. Data is saved in localStorage in this browser/origin. The local demo is not a shared database, does not send SMS/iMessage, and does not execute scheduled jobs. Another person's phone cannot access this browser's demo data. Keep those distinctions visible in a presentation.

To walk through the full flow: open Volunteers, review an unanswered participant, simulate YES, open their form in another tab, submit preferences, then return and confirm an available preferred role. The roster updates on focus/storage changes or Refresh.

## Connected backend mode

Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
VITE_EVENT_TIME_ZONE=America/Los_Angeles
```

Restart `npm run dev` after changing these values. Start the existing backend and its configured Postgres database using `backend/README.md`. Vite proxies `/api` to the backend, so development does not require changing teammates' CORS settings. A deployed frontend can use a same-origin reverse proxy or an explicit API base URL and the backend's configured allowed origin.

Screens consume `VolunteerApp` from `../../contracts/volunteer-contract.ts`. `src/data/index.ts` selects the persistent demo adapter or `HttpVolunteerApp` according to `VITE_DATA_MODE`. A failed real request never falls back to sample data.

Integrated against `main` at `b4e257f`:

| Frontend action | Existing backend route |
| --- | --- |
| List / read events | `GET /api/v1/events`, `GET /api/v1/events/{id}` |
| Create event and starter roles | `POST /api/v1/events`, then `POST /api/v1/events/{id}/roles` |
| Read role capacity | `GET /api/v1/events/{id}/roles` |
| Contact directory | Paginated `GET /api/v1/users` |
| Volunteer directory signup | `POST /api/v1/users` with name, email, and phone |

Email is required in connected registration. Preferences and texting permission are not collected there because the current user API cannot persist them. Connected mode labels contacts as directory records, not event participants.

The current service does not expose participation, public event forms, roster counts, assignments, campaign dispatch, or scheduling routes. Those controls and demo reply helpers are hidden/disabled in connected mode; unknown counts are displayed as unavailable. The Chert webhook and Python send adapter remain server-side; the frontend never calls Chert directly. The full local workflow remains available in clearly labeled demo mode.

Event creation currently requires multiple writes. If a role fails after the event is created, the adapter reports the created event ID and asks the coordinator to refresh/inspect it; it does not delete records or automatically create another event.

## Next integration boundaries

- IDs are opaque strings. The HTTP adapter maps `Role.name/slots_needed` to `Shift.role/capacity` and snake_case timestamps to the reference DTO fields.
- The backend does not persist event type, IANA timezone, or lifecycle state. Connected mode uses a generic event label, configured timezone, and a display-only date-based lifecycle; it hides the unsupported event-type input.
- Existing Signup rows alone do not encode invited/interested/standby/form status. B supplies that application lifecycle behind the interface.
- Coordinator authentication and public form token validation belong to the connected adapter/backend. Demo tokens are deliberately fake; never use their format for production authorization.
- The adapter normalizes FastAPI errors, including 422 field errors, without changing the backend's response envelope.
- As B publishes workflow routes, implement them in the HTTP adapter and enable the corresponding capability in `connection`. Keep backend authorization, capacity checks, webhook handling, and scheduling authoritative.

Kivo does not send messages or change assignments. Chert/model/database secrets belong on the server. No deployment or real Chert send is performed by installing/building the frontend.

## Structure

- `src/App.tsx`: coordinator workspace, composer, event setup, signup sheet/form, participant review.
- `src/data/`: shared-interface binding, persistent demo adapter, behavior tests.
- `src/ui.ts`: event-time formatting and timezone conversion.
- `src/components/KivoGuide.tsx`, `kivo-scene.ts`, `kivo.css`: the guide and isolated 3D scene.
- `src/styles.css`: coral/plum/cream visual system, responsive layouts, transitions.

Google Fonts is optional at runtime; system fonts remain usable offline. Three.js is lazy-loaded separately from the application screens.
