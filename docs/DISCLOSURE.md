# Disclosure: what was prepared before the event

This file lists everything prepared before the Social Good Hackathon (Friday Nov 6 2026).
It is updated whenever prepared work is added. Judges and organizers may read it at any time.

## Prepared before the event

| Date | What | Where | Tag |
|------|------|-------|-----|
| Nov 5 2026 | Market and user research (competitor audit, coordinator pain points, how Kiwanis and Key Club coordinate) | `docs/research/` | none |
| Nov 5 2026 | Honest assessment of whether the idea is different from existing tools | `docs/WEDGE.md` | none |
| Nov 5 2026 | Product spec (design only, no code) | `docs/SPEC.md` | none |
| Nov 5 2026 | Project instructions, README, decision list, Friday runbook (`docs/FRIDAY.md`) | `CLAUDE.md`, `README.md`, `docs/DECISIONS.md` | none |

| Nov 5 2026 | Generic foundation: Vite + React + TypeScript scaffold, Netlify config, Supabase schema with row-level security, Claude API wrapper (server only), shared validation, local demo-mode storage, design tokens, fake seed data, first tests. No event-specific features. | whole repo | `foundation-v0` |

| Nov 5 2026 | Full practice build: note parser, sign-up page, live roster with gaps, gap-filling and backfill drafts, youth-safe group messaging, student hours sheet, server function, tests, Friday runbook | whole repo | `rehearsal-full` |

Tag commits: `foundation-v0` = `5e94780`. `rehearsal-full` = the commit that adds this line (see
`git log`). The tags were created locally but this session's GitHub access could not push tags, so
they may need pushing by hand (see `docs/DECISIONS.md`). After `rehearsal-full`, Phase 4 fixes
(security, accessibility) were added on top and are also prepared work.

## How this was made
The research and documents were produced with the help of an AI coding assistant (Claude Code),
directed by Leonardo. Research sources are cited with URLs inside each research file. Claims the
assistant could not confirm are marked UNVERIFIED.

## What we will do on event day
We will read the event rules first. If prepared code is allowed, we will say so on stage and show
this file. If the rules require building from scratch, we will start a new, empty repository and
rebuild from the spec and research, without copying prepared code.
