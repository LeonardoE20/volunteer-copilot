# Volunteer Copilot

A free, zero-setup helper for small volunteer groups like a Kiwanis club or a high-school Key Club,
focused on the last 48 hours before an event.

1. A coordinator pastes a messy event note. The app turns it into roles and slots to check and edit.
2. Volunteers tap a link and pick a slot. No account, no password.
3. The coordinator's roster updates within seconds and shows the gaps.
4. **Fill this gap** picks who to ask from the club contact list (people who did that role before,
   not already busy) and drafts a message to each.
5. **Youth-safe:** students are only ever messaged in a group that includes the advisor. (This is our
   understanding of Kiwanis youth-protection guidance, still to be confirmed with the club.)
6. Mark someone as dropped out or a no-show, and backfill messages are drafted right away.
7. Nothing is sent automatically. The coordinator reviews each message and sends it from their own phone.
8. Mark students as attended to get a printable service-hours sheet for the advisor.

Built for the Social Good Hackathon (Nov 6 2026, West Valley College), Volunteer Coordination track,
partner Kiwanis Club of Campbell. Prepared work is listed in `docs/DISCLOSURE.md`.

## Run it (demo mode, no keys needed)
```bash
npm install
```
```bash
npm run dev
```
Open the printed address and press **Use the sample note**. In demo mode, data stays in this browser,
and the "AI" is a rule-based parser with message templates. All sample people are fake (555-01xx
numbers, example.org emails).

## Tests
```bash
npm test
```
```bash
npm run build && npx vite preview --port 4173
```
Then, in a second terminal (needs Playwright and Chromium):
```bash
node scripts/e2e-demo.cjs /tmp/e2e
```

## Switch on the live version (later, optional)
1. Create a Supabase project and run `supabase/migrations/*.sql`. Row-level security is on for every
   table, with no browser access at all; only the server function can read or write.
2. Create a Netlify site from this repo. Set the variables listed in `.env.example` in Netlify
   (never in the repo): `VITE_BACKEND=remote`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
   optionally `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_PARSE`, `CLAUDE_MODEL_WRITE`, `AI_DAILY_CAP`.
3. Without the AI variables, the live version still works with the rule-based parser and templates.

## Layout
- `src/`: React screens (`pages/`) and the data layer (`data/`: local demo backend, remote backend).
- `shared/`: logic used by both browser and server: validation, note parser, outreach planner
  (who to ask, youth-safe grouping), AI prompts and output checks.
- `netlify/functions/`: the single API endpoint (`rpc.mts`) plus a health check.
- `supabase/migrations/`: database schema, row-level security, rate-limit and safe sign-up functions.
- `docs/`: research, wedge, spec, Friday runbook, decisions, disclosure.
