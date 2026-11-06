import type {
  AppError, Delivery, DispatchReceipt, Event, EventWorkspace, MessageDraft,
  MessageDraftInput, Participation, Shift, SignupDetails, SignupForm, Volunteer, VolunteerApp,
} from '../../../contracts/volunteer-contract.ts';
import { VolunteerAppError } from './demo.ts';

interface ApiEvent { id: string; title: string; description?: string | null; location: string | null; starts_at: string; ends_at: string; created_at?: string; timezone?: string; event_type?: string | null; status?: Event['status'] | 'scheduled' }
interface ApiRole { id: string; event_id: string; name: string; slots_needed: number; starts_at: string; ends_at: string; created_at?: string }
interface ApiUser { id: string; name: string; email?: string | null; phone: string | null; created_at?: string; text_opt_in?: boolean; role_preferences?: string[] }
interface ApiParticipation { id: string; event_id: string; user_id: string; pool: Participation['pool']; status: Participation['status']; preferred_shift_ids: string[]; confirmed_shift_ids: string[]; availability: { starts_at: string; ends_at: string }[] | null }
interface ApiShift { id: string; event_id: string; name: string; capacity: number; starts_at: string; ends_at: string; coverage?: { confirmed: number; unfilled: number; awaiting_reply: number; standby: number } }
interface ApiWorkspace { event: ApiEvent; shifts: ApiShift[]; volunteers: ApiUser[]; participations: ApiParticipation[] }
interface ApiDraft { id: string; event_id: string; purpose: MessageDraft['purpose']; text: string; participant_ids: string[]; send_at: string | null; status: string; skipped?: { participant_id: string; reason: string }[] }
interface ApiDelivery { id: string; event_id: string | null; participation_id: string | null; draft_id: string | null; provider_message_id: string | null; state: Delivery['status']; error: string | null; created_at?: string }
interface ApiDispatch { draft_id: string; status: string; scheduled_for: string | null; deliveries: ApiDelivery[] }
interface ApiForm { event: ApiEvent; participant_id: string; volunteer_name: string; shifts: ApiShift[] }
interface ValidationDetail { loc?: (string | number)[]; msg?: string }
interface ErrorBody { code?: string; message?: string; retryable?: boolean; fields?: Record<string, string> }

/** Maps the shared VolunteerApp contract onto the FastAPI routes. A failed request never uses demo data. */
export class HttpVolunteerApp implements VolunteerApp {
  readonly mode = 'api';
  readonly baseUrl: string;
  private fetcher: typeof fetch;
  private timeZone: string;
  private now: () => number;
  constructor(options: { baseUrl?: string; timeZone?: string; fetch?: typeof fetch; now?: () => number } = {}) {
    this.baseUrl = (options.baseUrl || '/api/v1').replace(/\/+$/, '');
    this.timeZone = options.timeZone || 'America/Los_Angeles';
    this.fetcher = options.fetch || globalThis.fetch.bind(globalThis);
    this.now = options.now || Date.now;
  }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(this.baseUrl + path, {
        method, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      const error = new VolunteerAppError('upstream_failure', 'Could not reach the backend. Check the connection and backend address.');
      error.retryable = true; throw error;
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const detail: unknown = payload?.detail;
      const fieldErrors: Record<string, string> = {};
      const structured = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as ErrorBody : undefined;
      if (structured?.fields) Object.assign(fieldErrors, structured.fields);
      if (Array.isArray(detail)) {
        for (const issue of detail as ValidationDetail[]) {
          const field = (issue.loc || []).filter(part => part !== 'body' && part !== 'query').join('.');
          if (field && issue.msg) fieldErrors[field] = issue.msg;
        }
      }
      const fromStatus: AppError['code'] = response.status === 404 ? 'not_found' : response.status === 410 ? 'expired_link' : response.status === 409 ? 'conflict' : response.status === 429 ? 'rate_limited' : [400, 422].includes(response.status) ? 'validation' : 'upstream_failure';
      const known: Record<string, AppError['code']> = { expired_form: 'expired_link', capacity: 'conflict', schedule_passed: 'conflict', event_cancelled: 'conflict', details_required: 'conflict', messaging_unavailable: 'messaging_unavailable', validation: 'validation', not_found: 'not_found', upstream: 'upstream_failure' };
      const code = (structured?.code && known[structured.code]) || fromStatus;
      const message = typeof detail === 'string' ? detail : structured?.message || Object.values(fieldErrors).join(' · ') || `The backend returned an error (${response.status}).`;
      const error = new VolunteerAppError(code, message, Object.keys(fieldErrors).length ? fieldErrors : undefined);
      error.retryable = structured?.retryable ?? (response.status === 429 || response.status >= 500);
      throw error;
    }
    return payload as T;
  }
  private async all<T>(path: string): Promise<T[]> {
    const result: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await this.request<T[]>(`${path}?limit=500&offset=${offset}`);
      if (!Array.isArray(page)) throw new VolunteerAppError('upstream_failure', 'The backend returned an unexpected list response.');
      result.push(...page);
      if (page.length < 500) return result;
    }
  }
  private event(record: ApiEvent): Event {
    const ended = Date.parse(record.ends_at) <= this.now();
    const status: Event['status'] = record.status === 'cancelled' ? 'cancelled' : record.status === 'draft' ? 'draft' : record.status === 'completed' || ended ? 'completed' : 'published';
    return { id: record.id, title: record.title, type: record.event_type || 'Event', location: record.location || '',
      startsAt: record.starts_at, endsAt: record.ends_at, timeZone: record.timezone || this.timeZone, status };
  }
  private shift(record: ApiRole | ApiShift): Shift {
    const capacity = 'slots_needed' in record ? record.slots_needed : record.capacity;
    return { id: record.id, eventId: record.event_id, role: record.name, capacity, startsAt: record.starts_at, endsAt: record.ends_at };
  }
  private volunteer(record: ApiUser): Volunteer {
    return { id: record.id, name: record.name, email: record.email || undefined, phone: record.phone || '',
      preferredRoles: record.role_preferences || [], textOptIn: record.text_opt_in ?? false };
  }
  private participation(record: ApiParticipation): Participation {
    return { id: record.id, eventId: record.event_id, volunteerId: record.user_id, pool: record.pool, status: record.status,
      preferredShiftIds: record.preferred_shift_ids || [], assignedShiftIds: record.confirmed_shift_ids || [],
      availability: (record.availability || []).map(window => ({ startsAt: window.starts_at, endsAt: window.ends_at })) };
  }
  async listEvents(): Promise<Event[]> { return (await this.all<ApiEvent>('/events')).map(item => this.event(item)); }
  async createEvent(input: Omit<Event, 'id'>, shifts: Omit<Shift, 'id' | 'eventId'>[]): Promise<Event> {
    const event = await this.request<ApiEvent>('/events', 'POST', {
      title: input.title, location: input.location || null, starts_at: input.startsAt, ends_at: input.endsAt,
      timezone: input.timeZone, event_type: input.type, status: input.status === 'completed' ? 'published' : input.status,
    });
    try {
      for (const shift of shifts) await this.request<ApiRole>(`/events/${encodeURIComponent(event.id)}/roles`, 'POST', {
        name: shift.role, slots_needed: shift.capacity, starts_at: shift.startsAt, ends_at: shift.endsAt,
      });
    } catch (cause) {
      const error = new VolunteerAppError(cause instanceof VolunteerAppError ? cause.code : 'upstream_failure',
        `Event created (${event.id}), but some roles are incomplete. Reload and inspect it before retrying. ${cause instanceof Error ? cause.message : ''}`,
        cause instanceof VolunteerAppError ? cause.fieldErrors : undefined);
      // A retry of this whole operation could create another event. Do not delete or retry it.
      error.retryable = false; throw error;
    }
    return this.event(event);
  }
  async getEventWorkspace(eventId: string): Promise<EventWorkspace> {
    const workspace = await this.request<ApiWorkspace>(`/events/${encodeURIComponent(eventId)}/workspace`);
    const shifts = workspace.shifts.map(item => this.shift(item));
    const coverage = workspace.shifts[0]?.coverage;
    const confirmed = workspace.shifts.reduce((sum, item) => sum + (item.coverage?.confirmed ?? 0), 0);
    const capacity = shifts.reduce((sum, item) => sum + item.capacity, 0);
    return {
      event: this.event(workspace.event), shifts, volunteers: workspace.volunteers.map(item => this.volunteer(item)),
      participants: workspace.participations.map(item => this.participation(item)),
      coverage: { capacity, confirmed, unfilled: Math.max(capacity - confirmed, 0), awaitingReply: coverage?.awaiting_reply ?? 0, standby: coverage?.standby ?? 0 },
      shiftCoverage: workspace.shifts.map(item => ({ shiftId: item.id, capacity: item.capacity, confirmed: item.coverage?.confirmed ?? 0, unfilled: item.coverage?.unfilled ?? item.capacity })),
    };
  }
  async listVolunteers(): Promise<Volunteer[]> { return (await this.all<ApiUser>('/users')).map(item => this.volunteer(item)); }
  async registerVolunteer(input: Omit<Volunteer, 'id'>): Promise<{ volunteerId: string }> {
    if (!input.email?.trim()) throw new VolunteerAppError('validation', 'Email is required by the connected backend.', { email: 'Enter an email address.' });
    const user = await this.request<ApiUser>('/users', 'POST', {
      name: input.name, email: input.email.trim(), phone: input.phone.trim() || null,
      text_opt_in: input.textOptIn, role_preferences: input.preferredRoles,
    });
    return { volunteerId: user.id };
  }
  async addEventVolunteers(eventId: string, volunteerIds: string[], pool: Participation['pool']): Promise<Participation[]> {
    const rows = await this.request<ApiParticipation[]>(`/events/${encodeURIComponent(eventId)}/participations`, 'POST', { user_ids: volunteerIds, pool });
    return rows.map(item => this.participation(item));
  }
  async createMessageDraft(input: MessageDraftInput): Promise<MessageDraft> {
    const preset: Record<number, string> = { 10080: '1w', 1440: '1d', 60: '1h' };
    const timing = input.timing.kind === 'before_event'
      ? (preset[input.timing.minutes] ? { relative_offset: preset[input.timing.minutes] } : { minutes_before: input.timing.minutes })
      : input.timing.kind === 'at' ? { send_at: input.timing.at } : {};
    const draft = await this.request<ApiDraft>(`/events/${encodeURIComponent(input.eventId)}/drafts`, 'POST', {
      purpose: input.purpose, text: input.body, participant_ids: input.participantIds, audience: 'individual', ...timing,
    });
    return this.draft(input, draft);
  }
  async dispatchMessage(draftId: string): Promise<DispatchReceipt> {
    const receipt = await this.request<ApiDispatch>(`/drafts/${encodeURIComponent(draftId)}/dispatch`, 'POST');
    return { campaignId: receipt.draft_id, state: receipt.status === 'scheduled' ? 'scheduled' : 'queued',
      deliveryIds: receipt.deliveries.map(item => item.id), ...(receipt.scheduled_for ? { scheduledAt: receipt.scheduled_for } : {}) };
  }
  async getDeliveries(campaignId: string): Promise<Delivery[]> {
    const rows = await this.request<ApiDelivery[]>(`/drafts/${encodeURIComponent(campaignId)}/deliveries`);
    return rows.map(item => ({ id: item.id, messageId: item.id, campaignId: item.draft_id || campaignId, eventId: item.event_id || '',
      participantId: item.participation_id || '', providerMessageId: item.provider_message_id || undefined, status: item.state,
      updatedAt: item.created_at || new Date(this.now()).toISOString(), ...(item.error ? { error: { code: item.state, message: item.error } } : {}) }));
  }
  async loadSignupForm(token: string): Promise<SignupForm> {
    const form = await this.request<ApiForm>(`/forms/${encodeURIComponent(token)}`);
    return { event: { ...this.event(form.event), location: form.event.location || '' }, participantId: form.participant_id,
      volunteerName: form.volunteer_name, shifts: form.shifts.map(item => this.shift(item)) };
  }
  async submitSignupForm(token: string, input: SignupDetails): Promise<{ participantId: string; status: Participation['status'] }> {
    const result = await this.request<{ receipt: string; status: Participation['status'] }>(`/forms/${encodeURIComponent(token)}`, 'POST', {
      preferred_shift_ids: input.preferredShiftIds,
      availability: input.availability.map(window => ({ starts_at: window.startsAt, ends_at: window.endsAt })),
      ...(input.uniformNotes ? { uniform_notes: input.uniformNotes } : {}),
    });
    return { participantId: result.receipt, status: result.status };
  }
  async confirmAssignment(eventId: string, participantId: string, shiftId: string): Promise<Participation> {
    const row = await this.request<ApiParticipation>(`/participations/${encodeURIComponent(participantId)}/confirm`, 'POST', { shift_id: shiftId });
    if (row.event_id !== eventId) throw new VolunteerAppError('conflict', 'That assignment belongs to a different event.');
    return this.participation(row);
  }
  async cancelParticipation(eventId: string, participantId: string): Promise<Participation> {
    const row = await this.request<ApiParticipation>(`/participations/${encodeURIComponent(participantId)}/cancel`, 'POST');
    if (row.event_id !== eventId) throw new VolunteerAppError('conflict', 'That participation belongs to a different event.');
    return this.participation(row);
  }
  private draft(input: MessageDraftInput, draft: ApiDraft): MessageDraft {
    return { ...input, id: draft.id, participantIds: draft.participant_ids, body: draft.text,
      ...(draft.send_at ? { resolvedSendAt: draft.send_at } : {}),
      excluded: (draft.skipped || []).map(item => ({ participantId: item.participant_id, reason: item.reason })) };
  }
}
