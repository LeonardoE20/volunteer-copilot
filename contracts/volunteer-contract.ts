/**
 * Volunteer Copilot v0.1 — proposed transport-neutral integration boundary.
 * Reference DTOs, not database tables or a requirement to replace existing APIs.
 * Backend owners may map their existing names/records in one adapter.
 * See TEAM_INTEGRATION_AGREEMENT.md at the repository root for behavior and ownership.
 */
export type Id = string;
/** ISO 8601 timestamp with an offset or Z, e.g. 2026-11-14T15:00:00-08:00. */
export type Timestamp = string;

export const ROLE_PRESETS = [
  'Cook', 'Wrapper', 'Cashier', 'Runner', 'Dishwasher', 'Cleaner',
] as const;

export interface Event {
  id: Id;
  title: string;
  type: string;
  location: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  timeZone: string;
  status: 'draft' | 'published' | 'completed' | 'cancelled';
}

export interface Shift {
  id: Id;
  eventId: Id;
  /** Editable role name; ROLE_PRESETS are suggestions, not a closed enum. */
  role: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  capacity: number;
  requirements?: string[];
}

export interface Volunteer {
  id: Id;
  name: string;
  phone: string;
  /** Required by the current backend UserCreate endpoint; optional in the demo. */
  email?: string;
  preferredRoles: string[];
  textOptIn: boolean;
}

export type ParticipationStatus =
  | 'not_invited' | 'invited' | 'interested' | 'details_submitted'
  | 'confirmed' | 'declined' | 'cancelled';

export interface Availability {
  startsAt: Timestamp;
  endsAt: Timestamp;
}

export interface Participation {
  id: Id;
  eventId: Id;
  volunteerId: Id;
  pool: 'primary' | 'standby';
  status: ParticipationStatus;
  preferredShiftIds: Id[];
  availability: Availability[];
  /** Accepted, capacity-checked assignments; empty until confirmed. */
  assignedShiftIds: Id[];
}

export interface Coverage {
  /** Capacity and confirmed/unfilled counts are shift places, not unique people. */
  capacity: number;
  confirmed: number;
  /** All capacity not yet confirmed, including pending invitations. */
  unfilled: number;
  /** People within this event, not slot counts. */
  awaitingReply: number;
  standby: number;
}

export interface ShiftCoverage {
  shiftId: Id;
  capacity: number;
  confirmed: number;
  unfilled: number;
}

export interface EventWorkspace {
  event: Event;
  shifts: Shift[];
  volunteers: Volunteer[];
  participants: Participation[];
  coverage: Coverage;
  shiftCoverage: ShiftCoverage[];
}

export type MessagePurpose =
  | 'interest' | 'form_link' | 'policies' | 'uniform'
  | 'parking' | 'reminder' | 'standby';

export type Timing =
  | { kind: 'now' }
  | { kind: 'before_event'; minutes: number }
  | { kind: 'at'; at: Timestamp };

export interface MessageDraftInput {
  eventId: Id;
  purpose: MessagePurpose;
  /** Explicit event-participation IDs, not an unscoped global contact blast. */
  participantIds: Id[];
  body: string;
  timing: Timing;
  resourceLinks?: { label: string; url: string }[];
}

export interface MessageDraft extends MessageDraftInput {
  id: Id;
  /** Participants excluded by current backend/provider eligibility rules. */
  excluded?: { participantId: Id; reason: string }[];
  resolvedSendAt?: Timestamp;
}

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown';

export interface Delivery {
  id: Id;
  messageId: Id;
  campaignId: Id;
  eventId: Id;
  participantId: Id;
  providerMessageId?: string;
  /** sent = provider accepted; delivered requires a provider delivery signal. */
  status: DeliveryStatus;
  updatedAt: Timestamp;
  error?: { code: string; message: string };
}

export interface DispatchReceipt {
  campaignId: Id;
  state: 'queued' | 'scheduled';
  deliveryIds: Id[];
  scheduledAt?: Timestamp;
}

/** Returned only after validating the recipient-specific form link. */
export interface SignupForm {
  event: Pick<Event, 'id' | 'title' | 'location' | 'startsAt' | 'endsAt' | 'timeZone'>;
  participantId: Id;
  volunteerName: string;
  shifts: Shift[];
}

export interface SignupDetails {
  preferredShiftIds: Id[];
  availability: Availability[];
  uniformNotes?: string;
}

export interface AppError {
  code: 'validation' | 'not_found' | 'expired_link' | 'conflict'
    | 'messaging_unavailable' | 'rate_limited' | 'upstream_failure';
  message: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
}

/** Application operations used by frontend adapters; exact URL/RPC mapping is open. */
export interface VolunteerApp {
  listEvents(): Promise<Event[]>;
  createEvent(input: Omit<Event, 'id'>, shifts: Omit<Shift, 'id' | 'eventId'>[]): Promise<Event>;
  getEventWorkspace(eventId: Id): Promise<EventWorkspace>;
  listVolunteers(): Promise<Volunteer[]>;
  registerVolunteer(input: Omit<Volunteer, 'id'>): Promise<{ volunteerId: Id }>;
  addEventVolunteers(eventId: Id, volunteerIds: Id[], pool: Participation['pool']): Promise<Participation[]>;
  createMessageDraft(input: MessageDraftInput): Promise<MessageDraft>;
  dispatchMessage(draftId: Id): Promise<DispatchReceipt>;
  getDeliveries(campaignId: Id): Promise<Delivery[]>;
  loadSignupForm(token: string): Promise<SignupForm>;
  submitSignupForm(token: string, input: SignupDetails): Promise<{ participantId: Id; status: ParticipationStatus }>;
  confirmAssignment(eventId: Id, participantId: Id, shiftId: Id): Promise<Participation>;
  cancelParticipation(eventId: Id, participantId: Id): Promise<Participation>;
}

/** A receives this from B. The stable core ID is the send/deduplication key. */
export interface OutboundMessage {
  messageId: Id;
  eventId: Id;
  participantId: Id;
  toPhone: string;
  body: string;
}

export type SendResult =
  | { state: 'accepted'; providerMessageId: string; at: Timestamp }
  | { state: 'rejected'; code: string; message: string; at: Timestamp }
  | { state: 'unknown'; at: Timestamp; providerMessageId?: string };

/** A supplies normalized provider events; B resolves event context and effects. */
export type MessagingEvent =
  | {
      kind: 'reply'; providerEventId: string; providerMessageId: string;
      fromPhone: string; text: string; receivedAt: Timestamp;
      inReplyToProviderMessageId?: string;
    }
  | {
      kind: 'delivery'; providerEventId: string; providerMessageId: string;
      status: Exclude<DeliveryStatus, 'queued'>; at: Timestamp;
      error?: { code: string; message: string };
    }
  | {
      kind: 'opt_out'; providerEventId: string;
      fromPhone: string; at: Timestamp;
    };

export interface MessagingTransport {
  send(message: OutboundMessage): Promise<SendResult>;
  /** Optional provider lookup; otherwise A reports a manually reconciled result to B. */
  reconcile?(messageId: Id, providerMessageId?: string): Promise<SendResult>;
}
