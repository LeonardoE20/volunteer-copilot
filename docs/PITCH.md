# Pitch and partner handout

Every claim here is one we can show or point to. Anything we have not proven is labelled.
Before using this on Friday, check `docs/FRIDAY.md` step 2 (which version the rules allow) and
update the "what we tested" numbers if anything changed.

---

## Part 1: two-minute spoken pitch

Read at a normal pace this is about 2 minutes. Words in [brackets] are actions, not speech.

**Who it helps (about 20 seconds)**
"Every club event has one person who, the night before, is texting people one by one: who's still
coming, who can cover griddles, did the Key Club kids get the message. That person is who we built
this for. It's for small groups like a Kiwanis club and its Key Club, who don't want to set up
software or make volunteers create accounts."

**The main task, live (about 70 seconds)**
"Here's a coordinator's real-style note, messy as usual." [Paste the sample note, press Make roster.]
"In a few seconds it's a roster: griddles 6 people, cash box 2 people marked adults only, and the
to-dos it found, like 'Ray has the code'. The coordinator checks it and publishes."
[Press Publish.]
"Volunteers get a link. No account, no password: pick a slot, type a name and a phone number."
[Sign up on the second phone, or press Simulate a volunteer.]
"The roster updates by itself, and the gaps stay red."
[Press Fill this gap on Syrup/tables.]
"Now the part other free tools leave to the coordinator: who to ask. It suggests people who did this
job before and aren't already busy, and drafts each message. Look at the students: they are never
messaged one-to-one. They get one group message that includes their advisor. That's our
understanding of Kiwanis youth-protection guidance, and we want to confirm it with you."
[Mark a volunteer as Dropped out.]
"Someone's knee gives out the night before. One tap, and backfill messages are drafted. Nothing is
ever sent automatically: the coordinator reads it and taps send on their own phone."
[Optional, if time: mark a student Attended, open the advisor link, confirm hours.]
"Afterwards the advisor gets a private link to confirm student service hours with one tap."

**What we tested (about 15 seconds)**
"62 automated tests pass. They include 'a student is never in a one-to-one message' and AI replies
that try to add links or change who gets the message, which are blocked. We also ran the whole flow
in a phone-size browser. We had a security review and an accessibility check, and fixed what they found."

**What still needs work (about 15 seconds)**
"What you're seeing is demo mode: the data stays on this device, and the AI is simulated with simple
rules. The live version with a shared database and real AI is written and tested with stand-ins, but
it hasn't run for real yet. Real texting isn't built. And honestly, SignUpGenius and Golden are free for
simple sign-ups. Our difference is the last 48 hours: chasing the right person, backfilling, and
keeping students safe."

Do not quote any no-show statistic. Do not say the Campbell club uses any particular tool unless the
partners told us so at the panel.

---

## Part 2: one-page partner handout

> **Volunteer Copilot**: help for the last 48 hours before a club event
> Social Good Hackathon · Volunteer Coordination track · Nov 6 2026

**Who it helps**
- The one club member who coordinates an event and chases people by text the night before.
- Volunteers, who pick a slot from a link with no account or password.
- Key Club advisors, who confirm student service hours.

**The main task (working in the demo today)**
1. Paste a messy event note and get a draft list of slots: roles, times, how many people, and "adults only".
   The coordinator edits it, then publishes.
2. Volunteers tap a link and pick a slot. No account. They can take their name off later with their own link.
3. A live roster shows which slots are still short.
4. **Fill this gap** suggests who to ask from the club's contact list (people who did that job before and
   are not already busy) and drafts each message.
5. **Students are never messaged one-to-one.** They get one group message that includes the advisor.
   (This is our understanding of Kiwanis youth-protection guidance. Please tell us if it's wrong.)
6. Mark someone as dropped out, and backfill messages are drafted right away.
7. Nothing is sent automatically. The coordinator reviews every message and sends it from their own phone.
8. The advisor gets a private link to confirm students' service hours with one tap. It shows names and hours only.

**What we tested**
- 62 automated tests, including the youth-safe rule, full slots, adults-only slots, secret-link
  checks, and AI replies that try to add links or change recipients.
- The full flow run in a phone-size browser, with no errors.
- A security review (database access rules, secrets, rate limits, input checks, AI prompt
  tricks) and an accessibility check (contrast, keyboard, screen-reader labels). The issues found were fixed.

**What still needs work (we're being straight with you)**
- **The demo runs on one device.** The data stays in this browser, and the "AI" is simple rules. The
  shared-database and real-AI version is written and tested with stand-ins, but has not run live yet.
- **Real texting is not built.** Today the app opens the coordinator's own Messages or email app.
- **"Adults only" relies on volunteers telling the truth** about being a student.
- **There is no automatic deletion** of contact details after an event yet.
- **We have not interviewed a coordinator yet.** Your answers today are our first real feedback.
- **Free tools already exist** for simple sign-ups (for example SignUpGenius and Golden). What we add is
  chasing the right people, backfilling, and youth-safe messaging, with nothing to set up.

**Questions for you**
1. What do you use today, and what's painful about it?
2. When someone drops out the day before, what happens?
3. How do you reach Key Club students today? Does it go through the advisor?
4. How are student hours signed off now?
