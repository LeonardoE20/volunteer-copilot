# SPEC: Volunteer Copilot (draft, waiting for Leonardo's approval)

No product code will be written until this spec is approved.

## 1. Who it helps

The **one person who coordinates** a club service event, such as a Kiwanis pancake breakfast staffed
by Kiwanis adults and Key Club teens. Today that person keeps a spreadsheet and a group chat, and in
the last 48 hours texts people one by one to fill holes. Secondary users: **volunteers**, who just want
to tap a link and pick a slot, and the **Key Club advisor**, who has to confirm student hours.

## 2. The main task (must work live on stage)

1. The coordinator pastes a messy note (see the sample in `docs/research/kiwanis-keyclub.md` §6).
2. The app shows a draft: roles, shifts, how many people each needs, "adults only" flags, and to-dos
   it found (for example, "Ray has the storage code"). The coordinator edits and clicks Publish.
3. The coordinator gets two links: a **public sign-up link** to share, and a **private coordinator
   link** (secret token in the URL, no account).
4. A volunteer opens the sign-up link on a phone, picks a slot, and types a name and a phone or
   email. If they are a student, they tick "Key Club student". No account, no password.
5. The coordinator's roster updates within a few seconds and shows gaps in red: "Griddle 7:00–9:00:
   4 of 6."
6. The coordinator clicks **Fill gaps**. The app picks who to ask from the club contact list (people
   not yet signed up, people who did that role before, adults only where required), and the AI drafts
   a short message to each.
7. **Youth-safe rule:** any message to a student is never one-to-one. It is drafted as a group
   message that includes the advisor, following Kiwanis Youth Protection guidance.
8. The coordinator marks someone as a no-show or drop-out. The app immediately suggests backfill
   candidates and drafts the message.
9. Nothing is ever sent automatically. The coordinator copies the text or taps a link that opens their
   phone's messaging app with the text filled in.

## 3. Scope by priority

**Must (the 2.5-hour build):** steps 1–9 above, demo mode, and the seeded demo event.
**Should:** a contact list paste box (name, phone or email, adult or student, roles done before);
an "attended" checkbox per signup; a per-student hours summary the advisor can print or screenshot.
**Stretch:** real SMS through Twilio (still one click per batch, coordinator-approved); a "tap to
confirm hours" link for the advisor; reminders the evening before.
**Out of scope:** volunteer accounts, payments, recurring schedules, multi-org admin, native apps.

## 4. How it is built

- **Front end:** Vite + React + TypeScript, deployed on Netlify. Three screens: `/` (paste note and
  edit draft), `/e/:slug` (volunteer sign-up), `/c/:slug#token` (coordinator roster).
- **Server:** Netlify Functions (TypeScript). All writes go through functions, never straight from
  the browser to the database.
- **Database:** Supabase Postgres. Tables: `events`, `shifts` (role, start, end, needed,
  adults_only), `signups` (shift, name, contact, is_student, status), `contacts` (club list, per
  event), `drafts` (generated messages). The coordinator token is stored only as a hash.
- **Live roster:** the coordinator page polls a function every 5 seconds. Polling is simpler and more
  reliable than realtime subscriptions for a 2.5-hour build.
- **AI:** two functions call the Claude API on the server. `parse-note` turns the note into JSON that
  matches a fixed schema. `draft-nudges` writes message text. Choosing **who** to ask is plain code,
  not AI, so it is predictable and testable. The model name is set by an environment variable.
- **Demo mode:** if no Claude key is set, a rule-based parser and message templates are used. If no
  Supabase keys are set, data lives in browser storage, and a "simulate a volunteer signing up"
  button stands in for a second phone. The demo event is seeded with clearly fake names.

## 5. Safety and security (checked in Phase 4)

- **Secrets:** the Claude and Supabase service keys live only in Netlify environment variables.
  `.env` is gitignored; `.env.example` holds placeholders.
- **Row-level security:** RLS on every table. The anonymous browser role can read only the public
  fields of an event and its shifts (with a count of signups, never names or contact details). Every
  other read and every write goes through functions that check the coordinator token.
- **Input validation:** length limits (note up to 4,000 characters, names up to 60), phone and email
  format checks, and a schema check on everything the AI returns. Invalid AI output falls back to
  the rule-based parser.
- **Prompt injection:** the note and contact names are treated as data inside clear delimiters. The AI
  cannot take actions, only return text or JSON that is validated, and every message is reviewed by a
  human before it is sent.
- **Rate limits:** per IP and per event limits on AI calls and sign-ups, stored in a small Supabase
  table, plus a daily cap on AI calls so a public demo cannot burn the API budget.
- **Minors' data:** collect only first name, a contact, and the student flag. There is a one-tap
  "remove me" link for each volunteer. Demo data is fake.
- **Accessibility:** works at phone width, large tap targets, labels on every input, gaps shown with
  text as well as color, keyboard usable, WCAG AA contrast.

## 6. What we will test and show

- Unit tests: the rule-based parser on 5 messy notes, the "who to ask" ranking, the youth-safe rule
  (a student is never in a one-to-one draft), input validation.
- An end-to-end run on two real phones: publish, sign up, see the gap close, mark a no-show, backfill.
- If possible on Friday: hand the partner a phone and let them try the sign-up link themselves. Their
  reaction is our best "what we tested" evidence.

## 7. Two-minute demo script (matches the rubric)

1. **Who it helps** (15 s): "The one Kiwanis volunteer who texts 30 people the night before."
2. **Main task live** (75 s): paste note → roster → partner signs up on their phone → gap closes →
   mark Tom as out (his knee) → backfill text drafted, student message includes the advisor.
3. **What we tested** (15 s): the tests above, plus the partner's own try.
4. **What still needs work** (15 s): real SMS, real coordinator interviews, hour sign-off, and the
   fact that SignUpGenius and Golden are free and already cover simple sign-ups.

## 8. Event-day plan

If prepared code is allowed: start from `rehearsal-full`, disclose it, and spend the 2.5 hours on the
partner's real event and feedback. If the rules require building from scratch: build only the
**Must** list from this spec in a new repository, in this order: paste note → draft roster (mock
parser first) → sign-up page → roster with gaps → Fill gaps with templates → swap in real AI if time allows.
