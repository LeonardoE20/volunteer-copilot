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

| Nov 5 2026 | Final additions after `rehearsal-full`: security and accessibility fixes, advisor tap-to-confirm hours link, a test of the live AI code path against a mocked AI service, pitch and partner handout (`docs/PITCH.md`) | whole repo | branch only (latest commit on `claude/brave-pasteur-jembvq`) |

Tag commits: `foundation-v0` = `5e94780`. `rehearsal-full` = `84bf9c6`. The tags were created locally but this session's GitHub access could not push tags, so
they may need pushing by hand (see `docs/DECISIONS.md`). After `rehearsal-full`, Phase 4 fixes
(security, accessibility) were added on top in commits `3a2d1da` and `8dc8787`, then the advisor hours link (`5e83ff3`) and the live-AI-path test (`d5d28aa`). All of it is prepared work. `main` is deliberately left as the bare starting point; the prototype lives on the branch and in the tags.

## How this was made
The research and documents were produced with the help of an AI coding assistant (Claude Code),
directed by Leonardo. Research sources are cited with URLs inside each research file. Claims the
assistant could not confirm are marked UNVERIFIED.

## What we will do on event day
We will read the event rules first. If prepared code is allowed, we will say so on stage and show
this file. If the rules require building from scratch, we will start a new, empty repository and
rebuild from the spec and research, without copying prepared code.
