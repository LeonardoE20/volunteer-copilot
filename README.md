# volunteer-copilot

Volunteer coordination for the AI for Social Good Hackathon at West Valley College.

- [Frontend setup and backend integration](frontend/README.md)
- [FastAPI backend setup](backend/README.md)
- [Team integration agreement](TEAM_INTEGRATION_AGREEMENT.md)

## Frontend quick start

```sh
cd frontend
npm install
npm run dev
```

The default is a labeled, standalone demo. To connect to the existing event, role, and user APIs, copy `frontend/.env.example` to `frontend/.env.local`, set `VITE_DATA_MODE=api`, and run the backend as described in its README. Event participation and messaging controls stay unavailable in connected mode until their application routes are added.
