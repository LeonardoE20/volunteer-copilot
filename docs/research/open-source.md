# Open-source tools: a first look (Nov 6 2026)

**Status: first look only.** This comes from one quick GitHub search (by Leonardo's delegate) and a
reading of each project's public README, fetched Nov 6 2026. We did not read, run or copy any of their
code. We looked at these projects for ideas only. Their licenses (AGPL-3.0 for two of them) would put
obligations on any code copied into our repo, so none was copied. See `docs/DISCLOSURE.md`.

## OpenSignup (richshaw/OpenSignup)
- **Source:** https://github.com/richshaw/OpenSignup, with a hosted version at https://opensignup.org (not opened).
- **License:** AGPL-3.0, stated in its README and LICENSE file. GitHub's own license detector shows
  "NOASSERTION", because the LICENSE file is a short summary rather than the standard text.
- **What its README says, verified from the README text:**
  - "Ad-free, open-source sign-up sheets. No accounts for participants — ever." People click a link,
    pick a slot and are done.
  - Free to use at opensignup.org, with "no credit card", and self-hostable with Docker Compose.
  - Slots stop taking people when full. Participants can get a reminder email the day before.
  - "Works with AI assistants." Organizers can connect Claude, ChatGPT or any MCP client to create
    and manage signups.
  - Aimed at school parents, coaches and community organizers ("snack rotations, potlucks, volunteer
    shifts, and carpools").
  - Organizers sign in with an emailed link. Participants do not.
- **Not in its README (unverified either way; we did not read the code):** turning a pasted note into
  slots without an AI assistant, choosing who to ask for a specific empty slot, backfilling drop-outs,
  rules for messaging students, and advisor-confirmed service hours.
- **What it means for us:**
  - No-account sign-up is not unique to us. Neither is free and ad-free.
  - Reminders exist there too.
  - Because organizers can drive it from an AI assistant, "AI creates the sign-up" is also partly
    covered. Our pasted-note-to-roster step is a convenience, not a moat.
- **Activity:** last pushed Nov 5 2026, per the GitHub search API, so it is active right now.

## Volunteer Database (playasoft/volunteers)
- **Source:** https://github.com/playasoft/volunteers. **License:** AGPL-3.0 (GitHub search API).
- **What its README says:**
  - A volunteer scheduling system for festivals and community events. It was built for Apogaea, is now
    maintained by DenverBurners, and has been "in production use for over 10 years".
  - Events split into departments, and departments into shifts and slots.
  - Role- and permission-gated shifts, uploaded training certificates approved by admins, and
    password-protected shifts.
  - Self-hosted. Its roadmap mentions a hosted option in the future.
- **Fit for small clubs:** it is built for large events with many departments and certified roles.
  It appears to rely on volunteer profiles; we infer that from "upload through their profile", which
  is a guess and not checked.
- **What it means for us:** open-source shift scheduling with slots is long established. Not our wedge.

## BoosterWorks (sethhochberg/BoosterWorks)
- **Source:** https://github.com/sethhochberg/BoosterWorks. A related rewrite is at
  https://github.com/UXScripts/boosterworks-rails.
- **License:** none listed by GitHub for either.
- **Age:** last pushed Dec 2012, so old and apparently inactive.
- **What its release notes say (README.txt):**
  - "Admins can now move users into shift slots from the waitlist, and vice versa" (v0.6, July 2011).
  - Broadcast emails to registered users.
  - Accounts can be made inactive. Volunteers have accounts and profiles.
- **What it means for us:** a waitlist with coordinator move-from-waitlist is an old, proven idea.
  It's a possible addition only (see `docs/DECISIONS.md`).

## Updated honest summary
The parts that are already done by free or open-source tools:
- no-account sign-up;
- ad-free;
- slots that close when full;
- day-before reminders;
- an AI assistant creating sign-ups;
- waitlists.

What we still have not seen in any tool we checked, all unverified beyond README level:
1. pasting a coordinator's messy note and getting a draft roster with adults-only flags and to-dos;
2. choosing the right people to ask for a specific empty slot, and drafting backfill when someone drops;
3. youth-safe messaging, where students only get a group message with the advisor included;
4. a private link for the advisor to confirm student service hours.
