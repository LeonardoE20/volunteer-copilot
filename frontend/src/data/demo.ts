import type {
  AppError, Availability, Delivery, DispatchReceipt, Event, EventWorkspace,
  MessageDraft, MessageDraftInput, Participation, Shift, SignupDetails,
  SignupForm, Volunteer, VolunteerApp,
} from '../../../contracts/volunteer-contract.ts';

const KEY = 'volunteer-copilot-demo-v1';
const ROLES = ['Cook', 'Wrapper', 'Cashier', 'Runner', 'Dishwasher', 'Cleaner'];
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface DemoState {
  version: 1;
  events: Event[];
  shifts: Shift[];
  volunteers: Volunteer[];
  participants: Participation[];
  drafts: MessageDraft[];
  deliveries: Delivery[];
  receipts: Record<string, DispatchReceipt>;
  formNotes: Record<string, string>;
}
export class VolunteerAppError extends Error implements AppError {
  code: AppError['code'];
  retryable: boolean;
  fieldErrors?: Record<string, string>;
  constructor(code: AppError['code'], message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'VolunteerAppError';
    this.code = code;
    this.retryable = false;
    this.fieldErrors = fieldErrors;
  }
}
export function appErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
const copy = <T>(value: T): T => structuredClone(value);
function fail(code: AppError['code'], message: string): never {
  throw new VolunteerAppError(code, message);
}
function browserStorage(): DemoStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
function time(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result) || !/(Z|[+-]\d\d:\d\d)$/i.test(value)) fail('validation', 'Use a date and time with a timezone.');
  return result;
}
function checkRange(range: Availability): void {
  if (time(range.endsAt) <= time(range.startsAt)) fail('validation', 'End time must be after start time.');
}
function overlaps(a: Availability, b: Availability): boolean {
  return time(a.startsAt) < time(b.endsAt) && time(b.startsAt) < time(a.endsAt);
}
function phone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if ((value.trim().startsWith('+') || (digits.length === 11 && digits.startsWith('1'))) && digits.length >= 8 && digits.length <= 15) return '+' + digits;
  return fail('validation', 'Enter a valid phone number, including country code when outside the US.');
}
function seed(): DemoState {
  const names = ['Maya Chen', 'Jordan Lee', 'Sam Patel', 'Alex Rivera', 'Taylor Brooks', 'Morgan Reed', 'Casey Park', 'Riley Nguyen', 'Jamie Diaz', 'Avery Kim', 'Cameron Fox', 'Drew Ellis', 'Quinn Ross', 'Skyler Bell', 'Charlie Lane', 'Reese Gray', 'Emery Cole', 'Rowan West'];
  const volunteers: Volunteer[] = names.map((name, i) => ({
    id: `sample-v-${i + 1}`, name, phone: `+1202555${String(100 + i).padStart(4, '0')}`,
    preferredRoles: [ROLES[i % ROLES.length]], textOptIn: i !== 17,
  }));
  const events: Event[] = [14, 21].map(day => ({
    id: `sample-event-${day}`, title: day === 14 ? 'Stadium game day' : 'Stadium game day · next week',
    type: 'Stadium volunteering', location: 'Sample stadium · volunteer entrance',
    startsAt: `2026-11-${day}T15:00:00-08:00`, endsAt: `2026-11-${day}T20:00:00-08:00`,
    timeZone: 'America/Los_Angeles', status: 'published',
  }));
  const shifts = events.flatMap(event => ROLES.map((role, i) => ({
    id: `${event.id}-shift-${i + 1}`, eventId: event.id, role,
    startsAt: event.startsAt, endsAt: event.endsAt, capacity: 4,
  })));
  const participants: Participation[] = events.flatMap((event, eventIndex) => volunteers.map((volunteer, i) => {
    const confirmed = i < (eventIndex === 0 ? 12 : 6);
    const shift = shifts.filter(item => item.eventId === event.id)[i % 6];
    const status: Participation['status'] = confirmed ? 'confirmed' : i < 14 ? 'invited' : i < 16 ? 'details_submitted' : 'interested';
    return {
      id: `${event.id}-p-${i + 1}`, eventId: event.id, volunteerId: volunteer.id,
      pool: i >= 16 ? 'standby' : 'primary', status,
      preferredShiftIds: [shift.id], availability: [{ startsAt: event.startsAt, endsAt: event.endsAt }],
      assignedShiftIds: confirmed ? [shift.id] : [],
    };
  }));
  // Two contacts have not been invited to the next event yet.
  participants.filter(item => item.eventId === events[1].id).slice(14, 16).forEach(item => { item.status = 'not_invited'; });
  return { version: 1, events, shifts, volunteers, participants, drafts: [], deliveries: [], receipts: {}, formNotes: {} };
}

/** Local-only sample adapter. A queued delivery is never represented as a real send. */
export class DemoVolunteerApp implements VolunteerApp {
  readonly mode = 'demo';
  private state: DemoState;
  private storage: DemoStorage | null;
  private now: () => number;
  constructor(options: { storage?: DemoStorage | null; now?: () => number } = {}) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.now = options.now || Date.now;
    this.state = seed();
    this.refreshFromStorage();
  }
  /** Reload another tab's saved demo changes before reading or starting a mutation. */
  refreshFromStorage(): void {
    try {
      const raw = this.storage?.getItem(KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object' && (saved as DemoState).version === 1) {
        const candidate = saved as DemoState;
        if (['events', 'shifts', 'volunteers', 'participants', 'drafts', 'deliveries'].every(key => Array.isArray(candidate[key as keyof DemoState])) && candidate.receipts && candidate.formNotes) this.state = candidate;
      }
    } catch { /* Keep the current in-memory state if browser storage is unavailable. */ }
  }
  private id(prefix: string): string {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${this.now()}-${Math.random().toString(36).slice(2)}`}`;
  }
  private save(): void {
    try { this.storage?.setItem(KEY, JSON.stringify(this.state)); } catch {
      // Preserve unsaved in-memory work rather than restoring an older snapshot on the next call.
      this.storage = null;
    }
  }
  reset(): void { this.state = seed(); this.save(); }
  private event(id: string): Event {
    return this.state.events.find(item => item.id === id) || fail('not_found', 'This event could not be found.');
  }
  private participant(id: string, eventId?: string): Participation {
    return this.state.participants.find(item => item.id === id && (!eventId || item.eventId === eventId)) || fail('not_found', 'This volunteer is not on the selected event.');
  }
  private editable(event: Event): void {
    if (event.status === 'cancelled' || event.status === 'completed') fail('conflict', 'This event is closed.');
  }
  private excluded(participant: Participation, purpose: MessageDraftInput['purpose']): string | null {
    const volunteer = this.state.volunteers.find(item => item.id === participant.volunteerId);
    if (!volunteer?.textOptIn) return 'Volunteer has not opted in to texts.';
    if (participant.status === 'declined' || participant.status === 'cancelled') return 'Volunteer is no longer participating in this event.';
    if (purpose === 'standby' && participant.pool !== 'standby') return 'Volunteer is not in this event’s standby pool.';
    if (['uniform', 'parking', 'policies', 'reminder'].includes(purpose) && !participant.assignedShiftIds.length) return 'A confirmed assignment is required for preparation messages.';
    return null;
  }
  async listEvents(): Promise<Event[]> { this.refreshFromStorage(); return copy(this.state.events); }
  async createEvent(input: Omit<Event, 'id'>, inputs: Omit<Shift, 'id' | 'eventId'>[]): Promise<Event> {
    this.refreshFromStorage();
    checkRange(input);
    if (!input.title.trim() || !input.location.trim()) fail('validation', 'Add an event name and location.');
    try { new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).format(); } catch { fail('validation', 'Choose a valid timezone.'); }
    if (!inputs.length) fail('validation', 'Add at least one role and shift.');
    inputs.forEach(shift => {
      checkRange(shift);
      if (!shift.role.trim() || !Number.isInteger(shift.capacity) || shift.capacity < 1) fail('validation', 'Each role needs a name and a positive whole-number capacity.');
      if (time(shift.startsAt) < time(input.startsAt) || time(shift.endsAt) > time(input.endsAt)) fail('validation', 'Shifts must be within the event times.');
    });
    const event = { ...copy(input), title: input.title.trim(), id: this.id('event') };
    this.state.events.push(event);
    this.state.shifts.push(...inputs.map(shift => ({ ...copy(shift), id: this.id('shift'), eventId: event.id })));
    this.save(); return copy(event);
  }
  async getEventWorkspace(eventId: string): Promise<EventWorkspace> {
    this.refreshFromStorage();
    const event = this.event(eventId);
    const shifts = this.state.shifts.filter(item => item.eventId === eventId);
    const participants = this.state.participants.filter(item => item.eventId === eventId);
    const shiftCoverage = shifts.map(shift => {
      const confirmed = participants.filter(item => item.status === 'confirmed' && item.assignedShiftIds.includes(shift.id)).length;
      return { shiftId: shift.id, capacity: shift.capacity, confirmed, unfilled: Math.max(0, shift.capacity - confirmed) };
    });
    const confirmed = shiftCoverage.reduce((sum, item) => sum + item.confirmed, 0);
    const capacity = shifts.reduce((sum, item) => sum + item.capacity, 0);
    const ids = new Set(participants.map(item => item.volunteerId));
    return copy({ event, shifts, participants, volunteers: this.state.volunteers.filter(item => ids.has(item.id)), shiftCoverage,
      coverage: { capacity, confirmed, unfilled: capacity - confirmed,
        awaitingReply: participants.filter(item => item.status === 'invited').length,
        standby: participants.filter(item => item.pool === 'standby' && !['declined', 'cancelled'].includes(item.status) && !item.assignedShiftIds.length).length } });
  }
  async listVolunteers(): Promise<Volunteer[]> { this.refreshFromStorage(); return copy(this.state.volunteers); }
  async registerVolunteer(input: Omit<Volunteer, 'id'>): Promise<{ volunteerId: string }> {
    this.refreshFromStorage();
    const normalized = phone(input.phone);
    if (!input.name.trim()) fail('validation', 'Enter a volunteer name.');
    const existing = this.state.volunteers.find(item => item.phone === normalized);
    if (existing) return { volunteerId: existing.id };
    const volunteer = { ...copy(input), name: input.name.trim(), phone: normalized, id: this.id('volunteer') };
    this.state.volunteers.push(volunteer); this.save(); return { volunteerId: volunteer.id };
  }
  async addEventVolunteers(eventId: string, volunteerIds: string[], pool: Participation['pool']): Promise<Participation[]> {
    this.refreshFromStorage();
    this.editable(this.event(eventId));
    for (const id of volunteerIds) if (!this.state.volunteers.some(item => item.id === id)) fail('not_found', 'A selected volunteer could not be found.');
    const result = [...new Set(volunteerIds)].map(volunteerId => {
      const existing = this.state.participants.find(item => item.eventId === eventId && item.volunteerId === volunteerId);
      if (existing) return existing;
      const participant: Participation = { id: this.id('participant'), eventId, volunteerId, pool, status: 'not_invited', preferredShiftIds: [], availability: [], assignedShiftIds: [] };
      this.state.participants.push(participant); return participant;
    });
    this.save(); return copy(result);
  }
  async createMessageDraft(input: MessageDraftInput): Promise<MessageDraft> {
    this.refreshFromStorage();
    const event = this.event(input.eventId); this.editable(event);
    if (!input.body.trim()) fail('validation', 'Write a message before previewing.');
    if (!input.participantIds.length) fail('validation', 'Choose at least one recipient.');
    const participantIds = [...new Set(input.participantIds)];
    const recipients = participantIds.map(id => this.participant(id, event.id));
    let sendAt = this.now();
    if (input.timing.kind === 'before_event') {
      if (!Number.isFinite(input.timing.minutes) || input.timing.minutes < 0) fail('validation', 'Reminder timing must be a positive number of minutes.');
      sendAt = time(event.startsAt) - input.timing.minutes * 60_000;
    } else if (input.timing.kind === 'at') sendAt = time(input.timing.at);
    if (input.timing.kind !== 'now' && sendAt <= this.now()) fail('validation', 'That reminder time has already passed. Choose a future time.');
    const excluded = recipients.flatMap(item => { const reason = this.excluded(item, input.purpose); return reason ? [{ participantId: item.id, reason }] : []; });
    const draft: MessageDraft = { ...copy(input), participantIds, body: input.body.trim(), id: this.id('draft'), excluded, resolvedSendAt: new Date(sendAt).toISOString() };
    this.state.drafts.push(draft); this.save(); return copy(draft);
  }
  async dispatchMessage(draftId: string): Promise<DispatchReceipt> {
    this.refreshFromStorage();
    const previous = this.state.receipts[draftId];
    if (previous) return copy(previous);
    const draft = this.state.drafts.find(item => item.id === draftId) || fail('not_found', 'This draft could not be found.');
    this.editable(this.event(draft.eventId));
    if (draft.timing.kind !== 'now' && (!draft.resolvedSendAt || time(draft.resolvedSendAt) <= this.now())) fail('validation', 'That reminder time has already passed. Review the schedule before queuing it.');
    const recipients = draft.participantIds.map(id => this.participant(id, draft.eventId)).filter(item => !this.excluded(item, draft.purpose));
    if (!recipients.length) fail('validation', 'No eligible recipients remain. Review the audience.');
    const campaignId = this.id('sample-campaign');
    const deliveries: Delivery[] = recipients.map(item => ({ id: this.id('delivery'), messageId: this.id('sample-message'), campaignId, eventId: draft.eventId,
      participantId: item.id, status: 'queued', updatedAt: new Date(this.now()).toISOString() }));
    this.state.deliveries.push(...deliveries);
    const scheduled = draft.timing.kind !== 'now';
    const receipt: DispatchReceipt = { campaignId, state: scheduled ? 'scheduled' : 'queued', deliveryIds: deliveries.map(item => item.id), ...(scheduled ? { scheduledAt: draft.resolvedSendAt } : {}) };
    this.state.receipts[draftId] = receipt; this.save(); return copy(receipt);
  }
  async getDeliveries(campaignId: string): Promise<Delivery[]> {
    this.refreshFromStorage();
    if (!Object.values(this.state.receipts).some(item => item.campaignId === campaignId)) fail('not_found', 'This sample campaign could not be found.');
    return copy(this.state.deliveries.filter(item => item.campaignId === campaignId));
  }
  getDemoSignupToken(participantId: string): string {
    this.refreshFromStorage();
    const participant = this.participant(participantId);
    return `demo:${participant.eventId}:${participant.id}`;
  }
  private fromToken(token: string): Participation {
    const parts = token.split(':');
    if (parts.length !== 3 || parts[0] !== 'demo') fail('expired_link', 'This sample signup link is invalid. Open a fresh link from the demo.');
    const participant = this.participant(parts[2], parts[1]);
    this.editable(this.event(participant.eventId));
    if (['cancelled', 'declined'].includes(participant.status)) fail('expired_link', 'This event participation is no longer active.');
    return participant;
  }
  async simulateYES(participantId: string): Promise<string> {
    this.refreshFromStorage();
    const participant = this.participant(participantId); this.editable(this.event(participant.eventId));
    if (['cancelled', 'declined'].includes(participant.status)) fail('conflict', 'Re-add this volunteer before inviting them again.');
    if (['not_invited', 'invited'].includes(participant.status)) participant.status = 'interested';
    this.save(); return this.getDemoSignupToken(participantId);
  }
  async loadSignupForm(token: string): Promise<SignupForm> {
    this.refreshFromStorage();
    const participant = this.fromToken(token), event = this.event(participant.eventId);
    const volunteer = this.state.volunteers.find(item => item.id === participant.volunteerId)!;
    const { id, title, location, startsAt, endsAt, timeZone } = event;
    return copy({ event: { id, title, location, startsAt, endsAt, timeZone }, participantId: participant.id, volunteerName: volunteer.name,
      shifts: this.state.shifts.filter(item => item.eventId === event.id) });
  }
  async submitSignupForm(token: string, input: SignupDetails): Promise<{ participantId: string; status: Participation['status'] }> {
    this.refreshFromStorage();
    const participant = this.fromToken(token), event = this.event(participant.eventId);
    if (!input.preferredShiftIds.length) fail('validation', 'Choose at least one preferred role.');
    if (!input.availability.length) fail('validation', 'Share at least one available time.');
    input.preferredShiftIds.forEach(id => {
      if (!this.state.shifts.some(item => item.id === id && item.eventId === event.id)) fail('validation', 'Choose roles belonging to this event.');
    });
    input.availability.forEach(range => { checkRange(range); if (!overlaps(range, event)) fail('validation', 'Availability must overlap this event.'); });
    participant.preferredShiftIds = [...new Set(input.preferredShiftIds)];
    participant.availability = copy(input.availability);
    if (participant.status !== 'confirmed') participant.status = 'details_submitted';
    this.state.formNotes[participant.id] = input.uniformNotes?.trim() || '';
    this.save(); return { participantId: participant.id, status: participant.status };
  }
  async confirmAssignment(eventId: string, participantId: string, shiftId: string): Promise<Participation> {
    this.refreshFromStorage();
    this.editable(this.event(eventId));
    const participant = this.participant(participantId, eventId);
    const shift = this.state.shifts.find(item => item.id === shiftId && item.eventId === eventId) || fail('not_found', 'This shift is not part of the selected event.');
    if (participant.assignedShiftIds.includes(shiftId) && participant.status === 'confirmed') return copy(participant);
    if (!['details_submitted', 'confirmed'].includes(participant.status)) fail('conflict', 'Collect availability and role preferences before confirming an assignment.');
    if (!participant.preferredShiftIds.includes(shiftId)) fail('conflict', 'Choose one of this volunteer’s preferred roles.');
    if (!participant.availability.some(range => time(range.startsAt) <= time(shift.startsAt) && time(range.endsAt) >= time(shift.endsAt))) fail('conflict', 'This volunteer is not available for the full shift.');
    if (shift.requirements?.length) fail('conflict', 'This role has requirements. Verify them with the coordinator before using the demo assignment flow.');
    const occupants = this.state.participants.filter(item => item.status === 'confirmed' && item.assignedShiftIds.includes(shift.id));
    if (occupants.length >= shift.capacity) fail('conflict', 'This role is full. Choose another shift or keep the volunteer on standby.');
    const otherAssignments = this.state.participants.filter(item => item.volunteerId === participant.volunteerId && item.status === 'confirmed').flatMap(item => item.assignedShiftIds);
    if (otherAssignments.some(id => { const other = this.state.shifts.find(item => item.id === id); return other && overlaps(other, shift); })) fail('conflict', 'This volunteer already has an overlapping assignment, possibly at another event.');
    participant.assignedShiftIds.push(shift.id); participant.status = 'confirmed'; participant.pool = 'primary';
    this.save(); return copy(participant);
  }
  async cancelParticipation(eventId: string, participantId: string): Promise<Participation> {
    this.refreshFromStorage();
    this.event(eventId);
    const participant = this.participant(participantId, eventId);
    participant.status = 'cancelled'; participant.assignedShiftIds = [];
    this.save(); return copy(participant);
  }
}
