# Volunteer Copilot

A free, zero-setup helper for small volunteer groups like a Kiwanis club or a high-school Key Club.
A coordinator pastes a messy event note. The app turns it into roles and shifts. Volunteers tap a
link and pick a slot without creating an account. A live roster shows which slots are still empty.
The app then drafts short nudge messages to the right people and helps refill slots when someone
drops out.

Built for the Social Good Hackathon (Nov 6 2026, West Valley College), Volunteer Coordination track,
with the Kiwanis Club of Campbell as partner.

## Status
Research and design only. No product code yet. See:

- `docs/WEDGE.md`: an honest look at whether this is different from existing tools.
- `docs/SPEC.md`: what we plan to build (waiting for approval).
- `docs/DECISIONS.md`: everything that needs a decision or an action from the team.
- `docs/DISCLOSURE.md`: exactly what was prepared before the event.
- `docs/research/`: sources and findings.

## Planned stack
Netlify (site + serverless functions), Supabase (database with row-level security), and the Claude
API called only from a serverless function, so the key never reaches the browser. Without any keys,
the app runs in demo mode with mock AI.
