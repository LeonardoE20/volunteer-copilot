# Status and decisions for Leonardo (final, Nov 5 2026)

## FIRST: push the two tags (could not be done from the cloud session)
The cloud session could push the branch but not tags (GitHub answered 403). The GitHub connector there
has no tool to create tags or releases. Run these on your computer, in your clone of the repo:
```bash
git fetch origin claude/brave-pasteur-jembvq
```
```bash
git tag -a foundation-v0 5e94780 -m "Generic plumbing only (see docs/DISCLOSURE.md)"
```
```bash
git tag -a rehearsal-full 84bf9c6 -m "Full practice build (see docs/DISCLOSURE.md)"
```
```bash
git push origin foundation-v0 rehearsal-full
```
Check that they exist on GitHub:
```bash
git ls-remote --tags origin
```

## Decisions already made (by your delegate)
- **Do not merge** pull request https://github.com/LeonardoE20/volunteer-copilot/pull/1. `main` stays the bare
  starting point until Friday's rules are known. The prototype lives on branch
  `claude/brave-pasteur-jembvq` and in the two tags.
- The PR is not being watched.
- Spec approved. Pitch: lead with chasing the right person and backfilling, plus youth-safe group
  messaging with the advisor included, presented as our understanding to confirm with the partners.
- Vite + React + TypeScript. Model names are set only through environment variables.
- No paid services, no accounts or projects created, nothing deployed publicly, no real personal data,
  nothing sent automatically, no Twilio.

## What is done
- **Research and design:** `docs/research/`, `docs/WEDGE.md` (the wedge is real but thin), and `docs/SPEC.md`.
- **Foundation, tag `foundation-v0` = `5e94780`:** scaffold, config, database schema with row-level
  security, server-only Claude wrapper, validation, demo storage, design tokens, fake seed data.
- **Rehearsal prototype, tag `rehearsal-full` = `84bf9c6`:** every Must and Should item in the spec.
  - Paste a note, check and edit the draft roster, publish.
  - Volunteers sign up from a link with no account.
  - A live roster with gaps.
  - **Fill this gap** suggests who to ask and drafts the messages.
  - Students only ever get a group message with the advisor.
  - A drop-out or no-show drafts backfill messages right away.
  - A club contact list and an advisor section.
  - Nothing is sent automatically.
- **After `rehearsal-full`, on the branch only:**
  - Security fixes (`3a2d1da`) and accessibility fixes (`8dc8787`).
  - **Advisor tap-to-confirm hours link** (`5e83ff3`): the coordinator marks students Attended and sends a
    private link. The advisor sees names and hours only, and confirms with one tap and a typed name.
    The coordinator then sees "Confirmed by …".
  - A **test of the live AI code path** (`d5d28aa`) against a mocked AI service.
  - `docs/PITCH.md`: a two-minute pitch and a one-page partner handout, laid out by the rubric.
  - `docs/FRIDAY.md`: the Friday runbook.

## What was tested (final run, Nov 5)
- **62 automated tests pass** (`npm test`, 6 files). They cover:
  - the note parser;
  - the "who to ask" ranking;
  - the youth-safe rule;
  - capacity and adults-only checks;
  - secret-link checks;
  - sign-up spam limits;
  - input validation;
  - the advisor hours link (only attended students, no contact details, old links stop working);
  - **the real server function with a mocked AI service and an in-memory database**:
    - malformed, schema-breaking and failed AI replies all fall back safely;
    - an AI reply that adds links, phone numbers or extra recipients is stripped and ignored;
    - phone numbers and emails are never sent to the AI;
    - a wrong coordinator link is refused before any AI call.

  I checked that this last test is real by breaking the link-stripping on purpose: the test failed,
  then passed again once the code was restored.
- **A phone-size browser run of the whole flow passes** (`scripts/e2e-demo.cjs`) with no console errors:
  publish, sign-up, live roster, fill a gap, drop-out backfill, student attended, advisor confirms hours.
- **Not tested:** the real Netlify, Supabase and Claude services. You asked for no accounts or keys.
  Their code has only run against stand-ins.

## What still needs work
1. **Confirm the youth-protection rule with the partners at the 10:45 panel.** Present it as our
   understanding, not a fact about the Campbell club. Do not quote any no-show statistic.
2. **Demo mode keeps data on one device**, so a partner's own phone can't sign up for real.
   "Simulate a volunteer" stands in for the second phone. The advisor link also only works on the same device in demo mode.
3. **"Adults only" is self-declared** by volunteers.
4. **No automatic deletion** of contact details after an event. Add it before any real use with minors' data.
5. **The rule-based parser is simple.** The coordinator always reviews the draft. The real AI is wired in but has not run live.
6. **Not built:** Twilio texting and evening-before reminders.
7. Much of the competitor and pain-point research is marked UNVERIFIED (vendor sites and Reddit were blocked).

## Things you must do
1. Push the tags (top of this page).
2. Leave the PR unmerged until Friday's rules are known.
3. On Friday, read the event rules first, then follow `docs/FRIDAY.md`, using `docs/PITCH.md` for the talk and handout.
4. Practice the demo once on a phone with `npm install` and then `npm run dev`.
5. Optional, and only on free tiers if you choose: to let a partner's own phone sign up live, create
   Netlify and Supabase projects, run the three migrations in `supabase/migrations/`, and set the
   variables in `.env.example`. For real AI, add a Claude API key with a spending limit, and set
   `CLAUDE_MODEL_PARSE` and `CLAUDE_MODEL_WRITE`.
