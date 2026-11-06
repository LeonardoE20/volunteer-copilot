# Volunteer Copilot — team integration agreement

Version: 0.1 · November 6, 2026

Status: proposed working agreement for the three-person team. This captures the current product direction and a small shared boundary; it does not claim that teammates have already approved it. Database, deployment, endpoint names, branch names, and internal implementation remain the owners' choice.

## 1. What we are building

A coordinator can manage multiple events, keep a volunteer list, invite people by text, collect event-specific details through a form, and see which roles still need people.

The core demonstration is:

1. A volunteer joins the signup sheet, or a coordinator adds an existing volunteer.
2. The coordinator opens an event, selects volunteers, and reviews an invitation.
3. The coordinator sends the invitation through Chert.
4. The volunteer replies YES to that invitation.
5. The core service records interest and automatically sends the correct event-specific form link through Chert.
6. The volunteer submits availability and preferred roles.
7. The coordinator confirms an eligible role/shift; the dashboard updates.
8. The coordinator can prepare another event, schedule preparation messages, or contact standby volunteers for gaps.

For this version, YES expresses interest; submitting a form supplies details; a confirmed assignment fills a place. These are different outcomes. Coordinator confirmation is the proposed assignment default, independent of how the team implements it internally.

Core role presets:

| Role | Meaning |
| --- | --- |
| Cook | Prepare or cook food. |
| Wrapper | Wrap and package prepared food. |
| Cashier | Take orders and handle payment. |
| Runner | Gather and hand over items after the order/payment. |
| Dishwasher | Wash utensils, equipment, and dishes. |
| Cleaner | Clean work areas and handle cleanup. |

Roles remain editable strings. An event can add or rename roles without changing the shared contract. Any role-specific requirements belong to that event's shifts.

## 2. Ownership

| Owner | Owns | Supplies to the others |
| --- | --- | --- |
| Naman — frontend | Event dashboard, volunteer views/signup sheet, message composer and audience preview, volunteer form, loading/error/empty states, Kivo guidance and motion. | Screens that call one agreed application interface; sample data behind that interface while the backend is being connected. |
| Person A — Chert | Chert account/line integration, sending, receiving messages, provider delivery updates, provider-specific configuration and limits. | A send adapter and normalized reply/delivery events. No Chert credentials or raw provider payloads in frontend components. |
| Person B — core backend/integration | Events, volunteers, event participation, role capacity, persistence, application API, form links/submission, YES-to-form business logic, reminder scheduling and integration of A's adapter. | One source of truth for the dashboard and the public form; stable application responses and errors. |

Person B is the integration owner: maps existing code to the shared boundary and coordinates the first complete flow. Person A owns Chert behavior; Naman owns the interface. Each owner can organize their implementation as needed.

### The boundary between A and B

- B decides **who**, **which event**, **what message**, and **when**.
- A handles **how Chert sends it** and reports what Chert actually returns.
- A passes incoming replies to B with stable provider identifiers and reply context when available.
- B resolves the participant/event, records YES, creates or reuses the form link, and asks A to deliver the follow-up.
- Only B changes event participation and assignment state. A does not maintain a separate volunteer database.
- B owns reminder jobs. A delivers a message when B dispatches it. The browser is not the scheduler.

## 3. Preserve and connect existing work

Repository snapshot reviewed on November 6:

- `origin/main` at `4b944bd` contains the FastAPI service and existing health, Keenable search, and webpage-fetch routes under `/api/v1`.
- `origin/claude/brave-pasteur-jembvq` at `83ff00e` contains a separate prepared React/Vite application, shared schemas, local/remote data adapters, a Netlify RPC service, and Supabase migrations. The two snapshot branches also contain prepared versions.
- This local checkout is on `feat/frontend`, based on the reviewed `main`. The UI concepts shown in chat have not been added as application code.

The prepared application is a reference and possible source of reusable work, not an agreed replacement for the current backend. Its own documentation records prepared-work conditions. This agreement does not merge it or decide which prepared code the event permits.

Reuse candidates include its `Backend` interface, public/private event views, role/shift validation, and signup/roster screens. Keep its existing behavior explicit:

| Existing behavior | Difference needed for the current product |
| --- | --- |
| Frontend uses a `Backend` interface; remote calls use `/api/rpc`. | Keep an adapter boundary. REST versus RPC can stay internal; screens should not depend on raw Chert or database calls. |
| Signup creates a confirmed record immediately. | The agreed boundary must distinguish interest, submitted details, and a confirmed assignment. Map existing signup behavior deliberately. |
| Outreach drafts are `nudge` or `backfill`; messaging is manual. | Add real sending, YES follow-up, delivery records, and scheduling through A and B's boundary. |
| Individual events can be represented. | Add event listing and event-specific participation for the multi-event dashboard. |
| Local demo data is confined to one browser. | Cross-device signup/replies need the shared backend. Label local-only demonstrations clearly. |

Preserve any existing blocked-recipient or advisor/group handling if reusing that code; do not silently discard it while adapting messaging. Do not assume those older product assumptions were confirmed by the community partner.

## 4. Shared data vocabulary

The reference types are in [`../contracts/volunteer-contract.ts`](../contracts/volunteer-contract.ts). They describe exchanged data, not database tables or a required framework.

| Record | Minimum information |
| --- | --- |
| Event | Stable ID, title/type, location, start/end timestamps, timezone, lifecycle status. |
| Shift | Stable ID, event ID, role name, start/end, capacity. |
| Volunteer | Stable ID, name, normalized phone number, role preferences, permission to receive volunteer texts. |
| Participation | Stable ID, event ID, volunteer ID, primary/standby pool, participation status, preferred shift IDs, submitted availability, confirmed shift IDs when assigned. |
| Message draft | Stable ID, event ID, purpose, explicit participant IDs, text, optional resource links, timing. |
| Delivery record | Core message ID, event/participant IDs, provider message ID when known, delivery state, timestamps/error when available. |
| Signup form | One event and participant, public event/shift details, fields to submit. It does not expose the contact list or private coordinator roster. |

### Data rules we share

- IDs are opaque strings; the frontend does not parse meaning from them.
- Event and shift timestamps use ISO 8601 with an offset or `Z`. Events also include an IANA timezone, normally `America/Los_Angeles`. Display formatting belongs to the frontend; scheduling calculations belong to B.
- Phone numbers are normalized at the backend/provider boundary. Chert identifiers are not volunteer IDs.
- A volunteer is a reusable contact. Interest, role, standby, decline, and cancellation belong to a specific event.
- Required event form fields: availability and preferred role/shift. Uniform-related fields are optional if the organizer needs them. Parking passes/instructions are outbound event information, not required volunteer uploads.
- The backend returns roster counts. Pending replies and form submissions do not fill confirmed capacity.
- Confirming a role checks capacity and overlapping assignments on the server, including simultaneous requests.
- Coverage counts confirmed shift places, not necessarily unique people. A person can hold non-overlapping shifts; each assignment is checked independently.
- Return per-shift coverage for the role-gap view. `confirmed` and `unfilled` count shift places; `awaitingReply` and `standby` count people within that event.

### Participation lifecycle

`not_invited → invited → interested → details_submitted → confirmed`

`declined` and `cancelled` are additional outcomes. Standby is a separate pool, so a person can be interested while remaining on standby. A positive reply must not downgrade someone already confirmed; retries must not reset later states.

## 5. Application interface

Screens call these logical operations. B may implement them with existing endpoints, new routes, RPC actions, or adapters. Exact URLs are not fixed here.

| Operation | Expected result | Owner |
| --- | --- | --- |
| List/create events | Event summaries or the created event; creating the next event leaves the current one intact. | B |
| Get event workspace | Event, shifts, relevant volunteer/participation records, and coverage. | B |
| List/register volunteers | Contact list for coordinators; public registration returns only a receipt. | B |
| Add volunteers to an event | Event-specific participation records in a primary or standby pool. | B |
| Create/review a message draft | Text, event, purpose, explicit recipients, timing, and exclusions to show in the preview. | B; Naman renders/edits |
| Dispatch a reviewed draft | An accepted job/receipt, not a fabricated delivery confirmation. | B calls A |
| Read delivery results | Per-recipient sent/delivered/failed/unknown information when available. | B, using A's updates |
| Load/submit signup form | Valid event-specific form; submission receipt and updated participation. | B |
| Confirm/cancel an assignment | Validated participant/shift state and updated coverage. | B |

Naman's components use the same interface for sample and connected data. Do not scatter separate mock/live conditionals through individual screens. Mark sample data and simulated sends clearly. Kivo explains current state and can open/highlight UI; it does not independently send messages or change assignments.

## 6. Messaging and automation behavior

Message purposes: interest invitation, form link, policies, uniform/preparation, parking/arrival, reminder, and standby invitation. Each draft carries its event and recipient set.

- The coordinator explicitly dispatches a reviewed campaign. The YES-to-form response and previously scheduled messages are authorized automation within that campaign.
- A text blast means a batch of per-recipient messages by default, with per-recipient results. Do not assume that it means one group chat; preserve any existing special group/recipient rules when applicable.
- If a reused recipient rule requires a group that the current transport cannot support, block that send with a readable reason. Do not silently fall back to individual messaging.
- Presets are **1 week, 1 day, and 1 hour before the event**, with editable timing. Policies can go earlier; parking/arrival details must be available before travel. Nothing is scheduled until the coordinator chooses it.
- Store timing relative to the event or as an absolute timestamp. B computes the actual send time. If the event time changes, update relative schedules and show the revised timing. Do not silently send a preset whose time has already passed.
- Before sending a scheduled message, B rechecks event cancellation, participant eligibility/opt-out, current assignment, and whether that message has already been dispatched. A owns provider transport limits and capability reporting.
- `sent` means the provider accepted the message. `delivered` requires a delivery signal. Neither means interested or assigned. If a provider result is uncertain, show `unknown` and reconcile it before blindly resending.
- A supplies provider lookup/reconciliation when supported. Otherwise A reviews the provider result and reports it to B; keep the message `unknown` until resolved and require an explicit decision before another send.
- Failed or partial batches remain visible. Retrying a campaign must not resend already accepted recipients.

### YES replies and form links

1. A emits a normalized inbound reply, including stable provider event/message IDs, sender phone, text, received timestamp, and reply-to context if available.
2. B first handles STOP/provider opt-out events: mark the contact's `textOptIn` false and suppress queued volunteer messages across events. Then resolve ordinary replies to one invitation and event. Normalize simple YES/NO replies case-insensitively; other text can be left for coordinator review.
3. If that phone has invitations for multiple events and the event cannot be resolved, request clarification. Do not apply YES to every event or guess the most recent one.
4. Record interest, then create or reuse one valid event-and-participant-specific form link. Do not place a coordinator credential in that link.
5. B asks A to send the form link. Record that follow-up so duplicate webhooks do not send it again.
6. Form submission updates the same participation record and preferences. It must not create a duplicate volunteer, bypass capacity checks, or silently confirm a different event.

B deduplicates inbound business effects; A supplies stable provider IDs and supports provider idempotency where available. Core message IDs remain stable across retry/reconciliation attempts. Unknown outbound outcomes require reconciliation, not a claim of guaranteed exactly-once delivery.

## 7. Errors and refresh

- Application adapters return a consistent error with `code`, readable `message`, optional field errors, and `retryable`.
- Minimum cases: validation, not found/expired form, capacity/conflict, messaging unavailable, rate limited, and upstream failure.
- Existing FastAPI `{detail: ...}` and prepared RPC `{error, code}` responses can be normalized by one adapter. Do not break the current Keenable routes just to change their error envelope.
- The dashboard supports manual refresh. Background polling is enough for the first integration; realtime sockets are optional.
- Provider/model/database credentials stay server-side. The UI needs only the application connection configuration and scoped form/coordinator credentials supported by the chosen backend.

## 8. Work together without overwriting each other

- Keep frontend, core backend, and provider integration in separate feature branches or equivalent isolated changes. Use the team's branch names; the existing local frontend branch is `feat/frontend`.
- A, B, and Naman announce which modules/shared files they are editing before overlapping work.
- B coordinates shared router/configuration, contract changes, schema changes, and integration merges. Each person keeps their changes scoped to their area.
- Existing work is adapted or extended. Do not replace the backend or merge the prepared application wholesale as a shortcut.
- Changes to exchanged field names, statuses, or response meaning are posted to the team and reflected in this contract before the other owners integrate them. Add optional fields where possible; avoid surprise renames.
- Integrate a small working piece early. Do not wait for all screens, all reminder types, or character polish to be finished.

## 9. Integration order and acceptance

| Stage | Joint check |
| --- | --- |
| 1 — Shared event | B supplies one event with the six role presets; Naman renders it through the application interface. |
| 2 — Real send | Naman previews a selected recipient; B queues it; A sends to an agreed test phone and returns the actual provider result. |
| 3 — YES to form | Reply YES; the correct event-specific link arrives once; the public form loads on that phone. |
| 4 — Details to roster | Submit availability/role preference; coordinator confirms a valid shift; coverage updates on the dashboard. |
| 5 — Multi-event + standby | Create/open a second event; the first roster stays intact; a standby invitation affects only its selected event. |
| 6 — Reminder | Queue a short test reminder using the same path as the 1-week/1-day/1-hour presets; verify actual dispatch or label it simulated. |

Also check duplicate YES delivery, ambiguous YES across two events, capacity conflict, expired form link, provider failure/unknown outcome, and cancelled-event reminders. Each owner checks their boundary; run the end-to-end path together.

Person A reports line readiness and send/reply capability. Person B reports the shared event/form/job path. Naman reports connected UI states. The team can use this version immediately as a proposed boundary and refine the mapping without changing databases or restarting existing work.
