# Friday runbook (Nov 6 2026, West Valley College)

Short and in order. Tick each step.

## 1. Before 10:45: read the rules
- [ ] Read the event rules on prepared work. Look for words like "from scratch", "pre-existing code",
      "templates", "boilerplate", "AI tools".
- [ ] If anything is unclear, ask an organizer directly and write down their answer and name.

## 2. Pick which version to use
| What the rules say | What we use |
|---|---|
| Prepared code is fine if disclosed | `rehearsal-full`, plus show `docs/DISCLOSURE.md` |
| Generic boilerplate is fine, but not the product | `foundation-v0`, then rebuild the features (section 5) |
| Everything must be built at the event | New empty repo; rebuild from `docs/SPEC.md` (section 5). Research and spec only. |
| Not sure | Ask. If no answer, take the strictest reading. |

To check out a version (the tags may need pushing first; see `docs/DECISIONS.md`):
```bash
git checkout rehearsal-full
```
```bash
npm install
```
```bash
npm run dev
```

## 3. Partner panel (10:45): questions to ask
Ask these first and write down the exact words people use.
1. **What do you use today to get volunteers for an event, and what is painful about it?**
2. Think of your last event. Who chased people who hadn't answered, and how long did it take?
3. When someone drops out the day before, what happens?
4. How do you reach Key Club students? Do you ever text a student directly, or does it go through the advisor? (This checks our youth-protection understanding. It is our reading of Kiwanis guidance, not a confirmed fact about this club.)
5. How are student service hours signed off today?
6. Would you use a link that needs no account? What would stop you?

If the answers say slot-filling is not the real problem (for example, recruiting new members is),
change the pitch or the feature that day. Do not force our idea onto their answers.

## 4. Two-minute demo script
Have two phones ready: one as the coordinator, one handed to a partner as a volunteer.
Use demo mode unless live keys were set up. Demo mode keeps data on one device, so the
"Simulate a volunteer" button stands in for the second phone.

1. **Who it helps (15 s):** "This is for the one club member who texts 30 people the night before an event."
2. **Main task, live (75 s):**
   - Paste the messy pancake-breakfast note and press **Make roster**. Slots, counts and the adults-only cash box appear.
   - Press **Publish**. Show the sign-up link and the private coordinator link.
   - A volunteer picks a slot with no account. The roster updates within seconds.
   - Press **Fill this gap** on Syrup/tables. Adults get their own messages. Students get one group message that includes the advisor.
   - Mark the volunteer who just signed up for Griddles as **Dropped out** ("like Tom and his knee in the note"). Backfill messages appear right away, aimed at people who did griddles before.
   - Point out that nothing is sent automatically: the coordinator taps "Open in Messages".
3. **What we tested (15 s):** 62 automated tests, including "a student is never messaged one-to-one", plus a full browser run of the flow and whatever the partner tried today.
4. **What still needs work (15 s):** real texting (Twilio), confirming the youth-protection rule with the club, real coordinator interviews, and honesty that SignUpGenius and Golden are free for simple sign-ups. Our difference is the last 48 hours: chasing the right people and backfilling.

Do not quote any no-show statistic.

## 5. Rebuild-from-scratch plan (2.5 hours)
Build only the **Must** list in `docs/SPEC.md`, in this order. Keep the app working after each step.
| Time | Step |
|---|---|
| 11:45–12:00 | Vite + React + TS scaffold, one page, deploy or run locally. Split the team: one person on the parser, one on screens. |
| 12:00–12:30 | Paste note → draft roster with a simple rule-based parser (counts, time ranges, "adults only"). |
| 12:30–1:00 | Publish → public sign-up page (name, phone or email, student checkbox). Store in localStorage. |
| 1:00–1:25 | Coordinator roster with gaps in red and a live refresh. |
| 1:25–1:50 | "Fill gap": pick people from a pasted contact list; students grouped with the advisor; message templates; copy and sms: links. |
| 1:50–2:05 | Mark drop-out → backfill drafts. |
| 2:05–2:15 | Rehearse the demo script once. Stop coding. |

If time is short, cut in this order: the contact paste (hard-code a list), the hours table, real AI.
