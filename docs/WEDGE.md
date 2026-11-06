# The wedge: an honest assessment

Short version: **the wedge is real but thin.** No single product we found does all of it, but every
piece already exists somewhere, often for free. We cannot win on "nobody else does this". We can win
on "this fixes the Campbell club's actual Friday-night problem in two minutes, with nothing to set up."

**Update, Nov 6 (first look, README level only; see `docs/research/open-source.md`):** open-source
tools already offer no-account sign-up. **OpenSignup** (AGPL-3.0) is free, ad-free and self-hostable.
Its README says "no accounts for participants — ever", and it has day-before reminder emails and lets
organizers create sign-ups through an AI assistant. **playasoft/volunteers** (AGPL-3.0) is a long-running
open-source festival shift scheduler. **BoosterWorks** (2011–2012) let admins move people between a
waitlist and shift slots. So no-account sign-up, free, ad-free, reminders and waitlists are **not** our
difference. Our difference is only these four things, none of which we found in any tool we checked:
1. **Pasted note to roster:** a coordinator's messy note becomes draft slots with counts, times,
   adults-only flags and to-dos, ready to edit.
2. **Chasing the right person for an empty slot:** suggesting who to ask (did that job before, not
   busy) and drafting the message, plus backfill drafts the moment someone drops out.
3. **Youth-safe group messages:** students are only ever messaged in a group that includes the advisor.
4. **Advisor-confirmed student hours:** a private link where the advisor confirms service hours with one tap.
We checked these against README pages only, not code, so treat "not found" as "not seen yet".

All competitor facts below come from `docs/research/competitors.md`. Important caveat: the session's
network blocked direct visits to vendor sites, so every claim there came from search-result summaries
and review aggregators, not from a page read today. Treat them as likely, not confirmed.

## What we were told, checked

| Claim | Result |
|---|---|
| Golden's free plan covers unlimited volunteers, scheduling, hour tracking, notifications | Mostly confirmed. Free, unlimited volunteers, up to 5 admins, hour tracking, SMS/email/push. Free-plan scheduling details not separately confirmed. |
| VolunteerHub is paid-only from about $143/mo | Confirmed via aggregators (plus a setup fee). No free plan. |
| SignUpGenius is free or Silver $11.99, no-account signups | Confirmed with corrections. Free tier shows ads. Silver is $11.99/mo on a pricing PDF, but some listings show $14.99 billed monthly. Text reminders are paid-only. |
| GrasshopperSignup does AI form generation from plain language, no login | Partly confirmed. The AI form builder is real. "No account" is confirmed for the organizer; for volunteers it is unverified. SMS is a paid add-on. |
| AI shift-fillers exist for staffing and healthcare | Confirmed for Teambridge and EngineHire. CovrMyShift could not be verified. |

## Does anyone do all of it?

Not that we found, but several parts are common. No-account sign-up and free, ad-free use are already
offered by open-source tools (OpenSignup, above) and by SignUpGenius's free tier, so they are not part of
our difference. The combination of note to roster, targeted gap-chasing with backfill, youth-safe group
messaging and advisor-confirmed hours was not in any product or README we checked.

- GrasshopperSignup comes closest on the sign-up side: free, AI form from plain words, small groups.
  It sends only generic reminders and does not chase specific people for a specific empty slot.
- Teambridge comes closest on the chasing side, but it is paid staffing software for nursing homes
  and staffing agencies, not for volunteers.
- Golden is the best free volunteer system, but it has no AI chasing, and a small club still has to
  set up an organization and admins.
- SignUpGenius is what many clubs already use. It is free with ads, and texting is paid.

## Why the wedge is weak

1. "Note to form" alone is not unique. GrasshopperSignup already does it, and OpenSignup lets organizers
   create sign-ups through an AI assistant. No-account sign-up is not unique either (OpenSignup, SignUpGenius).
2. Gap-chasing is a feature, not a product. Any of these vendors could add "text people who haven't
   signed up yet" in a sprint.
3. Free and good enough beats new. A club already on SignUpGenius or Golden has little reason to switch.
4. We have no first-hand coordinator interviews yet. The pain-point research came from search
   summaries, because Reddit and review sites were blocked. The most-cited pain points (no-shows,
   chasing people by text, spreadsheet and group-chat chaos) fit our idea, but they are not proof.
5. There is no reliable published no-show rate for volunteers. Do not quote a number on stage
   unless it comes from the Campbell club itself.

## Where the wedge is real (and what we should lean on)

1. **The agent, not the form.** The hard part of coordination is the last 48 hours: who hasn't
   answered, who dropped, who can cover. A copilot that says "Griddle 7–9 is short 2; here are 3
   people who did griddles last time; here's the text" is the part no free volunteer tool does.
2. **Youth-protection-aware messaging.** This is the most specific and defensible angle we found.
   Kiwanis Youth Protection guidance (2025, see `docs/research/kiwanis-keyclub.md`) says no
   one-on-one electronic messages from an adult to a teen, with two adults included. A tool that
   automatically routes any nudge to a Key Club member through a group message or with the advisor
   copied solves a real compliance problem for exactly this partner. Generic tools don't know this rule.
3. **One event covers two kinds of volunteer.** Kiwanis adults (older, prefer email or a phone call)
   and Key Club teens (SMS, need service-hour sign-off) work the same pancake breakfast. Handling
   both in one roster, with a "tap to confirm hours" link for the advisor, fits this partner well.
4. **Zero setup.** No organization account, no admin seats, no volunteer logins. A coordinator can
   use it the first time, during the event, with no training.

## Recommendation

Pitch it as "a copilot for the last 48 hours before a club event", not as "volunteer management
software". Show the gap-chasing agent and the youth-safe messaging live; treat note-to-roster as the
fast on-ramp, not the headline. Say plainly on stage that SignUpGenius and Golden exist and are free,
and explain what they leave to the coordinator. Judges score impact and feasibility, and this honesty
supports both.

What would disprove the hypothesis on Friday: if the Kiwanis partner says their real problem is not
filling slots (for example, it's recruiting new members, or the same 10 people always show up),
or that they are happy with their current tool. Ask the questions in
`docs/research/kiwanis-keyclub.md` section 5 in the first 15 minutes and be ready to change direction.
