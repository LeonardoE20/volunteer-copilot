# Status and decisions for Leonardo (updated Nov 5 2026)

Everything you need to know or do is on this page.

## What is done
- **Research (Phase 0):** competitor audit, coordinator pain points, and notes on how Kiwanis and Key
  Club coordinate (`docs/research/`). An honest wedge assessment (`docs/WEDGE.md`): the wedge is real but thin.
- **Spec (Phase 1):** `docs/SPEC.md`, approved with the decisions below.
- **Foundation (Phase 2), tag `foundation-v0` = commit `5e94780`:** scaffold, config, database schema with
  row-level security, server-only Claude wrapper, validation, demo storage, design tokens, fake seed data.
- **Rehearsal prototype (Phase 3), tag `rehearsal-full` = commit `84bf9c6`:** every Must and Should item in the spec.
  - Paste a note, get a draft roster, edit it, publish.
  - Volunteers sign up from a link with no account, and can remove themselves.
  - A live roster with gaps.
  - **Fill this gap** picks who to ask and drafts the messages. Students only ever get a group message with the advisor.
  - Marking a drop-out or no-show drafts backfill messages right away.
  - A club contact list, an advisor section, and a printable student-hours sheet.
  - Nothing is ever sent automatically.
  - It runs fully in demo mode. The server function and Supabase migrations are written but not deployed.
- **Phase 4 (on top of `rehearsal-full`, commits `3a2d1da` and `8dc8787`):**
  - The security review found no high-severity issues. Seven medium and low ones were fixed: the AI budget cap can no longer be used up by one client; sign-up spam is limited to 3 slots per person; students are refused where the event doesn't take them; email addresses are stricter; contact details the AI invents are stripped; a half-built event is rolled back.
  - The accessibility audit found two high and four medium issues, plus a few low ones, all fixed: the focus ring and input borders now meet contrast; focus moves sensibly after actions; each screen has its own tab title; error messages are linked to their fields; there is no sideways scroll at 320px wide.

## What was tested
- **46 automated tests pass** (`npm test`), covering:
  - the note parser on 6 messy notes;
  - the "who to ask" ranking;
  - the youth-safe rule (a student is never in a one-to-one draft, and student drafts are blocked without an advisor contact);
  - overbooking and adults-only checks;
  - token checks;
  - input validation;
  - the server function without keys;
  - rejecting bad AI output, including an AI reply that tries to add links or change recipients.
- **A browser run of the whole flow at phone size passes** (`scripts/e2e-demo.cjs`): publish, volunteer sign-up, roster update, fill a gap, drop-out backfill, with no console errors.
- **Not tested:** the live Netlify, Supabase and Claude path. You asked for no accounts or keys, so the server code is reviewed and unit-tested only, never run against a real database. No real coordinator has tried it yet.

## What still needs work
1. **Confirm the youth-protection rule with the partners at the 10:45 panel.** The app's wording calls it
   "our understanding". Do not present it as a proven fact about the Campbell club. Do not quote any no-show statistic.
2. **Demo mode keeps data on one device.** A partner's phone cannot sign up for real unless the live
   version is switched on. The "Simulate a volunteer" button stands in for the second phone.
3. **"Adults only" is self-declared.** A student could leave the student box unticked. Say so if asked.
4. **No deletion of old events yet.** Volunteers can remove themselves, but there is no automatic
   clean-up of contact details after an event. Add one before real use with minors' data.
5. **The rule-based parser is simple.** It handles common notes well, but odd wording can produce wrong
   slots. The coordinator always reviews the draft. The real AI is wired in but has not been tried live.
6. **Not built (Stretch):** real SMS through Twilio, the advisor's "tap to confirm hours" link, and
   evening-before reminders.
7. **The spec's `drafts` table was dropped.** Drafts live only on the coordinator's screen, which is
   simpler and stores less personal data.
8. Much of the competitor and pain-point research is marked UNVERIFIED, because this session's network
   blocked the vendor sites and Reddit.

## Things you must do
1. **Push the two tags.** This session's GitHub access could push the branch but not tags. On your computer:
   ```bash
   git fetch origin claude/brave-pasteur-jembvq
   ```
   ```bash
   git tag -a foundation-v0 5e94780 -m "Generic plumbing only"
   ```
   ```bash
   git tag -a rehearsal-full 84bf9c6 -m "Full practice build"
   ```
   ```bash
   git push origin foundation-v0 rehearsal-full
   ```
2. **Review and merge the pull request** into `main` when you're happy. It was opened but not merged.
3. **Read the event rules first thing Friday** and follow `docs/FRIDAY.md`.
4. **Practice the two-minute demo once** on a phone with `npm run dev`, or on a free static deploy of `dist/` if you choose to make one.
5. **Optional, only if you decide to spend nothing more than free tiers:** to let a partner's own phone
   sign up live, create free Netlify and Supabase projects, run the two migrations, and set the
   variables in `.env.example`. For real AI, also add a Claude API key with a spending limit, and set
   `CLAUDE_MODEL_PARSE` and `CLAUDE_MODEL_WRITE` to the models you chose. These are not hardcoded anywhere.

## Decisions already made (by your delegate, Nov 5)
- Spec approved. Pitch: lead with chasing the right person and backfilling, plus youth-safe group
  messaging with the advisor included, presented as our understanding to confirm with the partners.
- Vite + React + TypeScript.
- Model choice is set only through environment variables.
- No paid services, no accounts created, no real personal data, nothing sent automatically.
