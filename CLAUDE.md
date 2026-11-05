# CLAUDE.md — Volunteer Copilot

## Mission
Help Leonardo win first prize ($500) at the Social Good Hackathon, Friday Nov 6 2026,
West Valley College, Saratoga. Track: Volunteer Coordination, partner Kiwanis Club of Campbell.
Judging: real-world impact and feasibility. The organizers' rubric asks for: who it helps, the main
task working live, what we tested, and what still needs work. Build window on the day: 11:45–2:15
(2.5 hours), teams of 2–4. Partners judge and see prototypes first.

## Product hypothesis ("coordinator copilot")
A coordinator pastes a messy event note → AI turns it into roles and shifts → volunteers tap a link and
pick a slot with no account → a live roster shows gaps → AI drafts nudge texts to the right people and
backfills no-shows. Stretch: Twilio SMS, student service-hour records.
This is a hypothesis to disprove, not a fact. See docs/WEDGE.md for the honest assessment.

## Stack
Netlify (static front end + serverless functions) + Supabase (Postgres, RLS) + a serverless
Claude API function. The API key never reaches the browser.
The app MUST run in demo mode with mock AI and in-memory/local data when no keys exist.

## Rules
- Be honest. Never hide prepared work. docs/DISCLOSURE.md lists exactly what was made before the event.
- Tags: `foundation-v0` = generic plumbing only. `rehearsal-full` = the full practice build.
- On event day the event rules decide what we may use. If they require building from scratch,
  rebuild fresh from docs/SPEC.md and do not use the prepared code.
- No product code until Leonardo approves docs/SPEC.md.
- Never commit secrets. `.env` is gitignored; only `.env.example` is committed.
- Do not put model identifiers in commits, code, or docs.

## Phases
0 research (docs/research/*, docs/WEDGE.md) → 1 docs/SPEC.md, STOP for approval →
2 foundation, tag foundation-v0 → 3 rehearsal prototype, tag rehearsal-full →
4 tests, security review (RLS, secrets, rate limits, input validation, prompt injection), accessibility.

## Where decisions live
docs/DECISIONS.md holds everything Leonardo must decide or do, in one place.
