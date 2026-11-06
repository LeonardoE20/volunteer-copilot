import type {
  AppError, Delivery, DispatchReceipt, Event, EventWorkspace, MessageDraft,
  MessageDraftInput, Participation, Shift, SignupDetails, SignupForm, Volunteer, VolunteerApp,
} from '../../../contracts/volunteer-contract.ts';
import { VolunteerAppError } from './demo.ts';

interface ApiEvent { id: string; title: string; description: string | null; location: string | null; starts_at: string; ends_at: string; created_at: string }
interface ApiRole { id: string; event_id: string; name: string; slots_needed: number; starts_at: string; ends_at: string; created_at: string }
interface ApiUser { id: string; name: string; email: string; phone: string | null; created_at: string }
interface ValidationDetail { loc?: (string | number)[]; msg?: string }

/** Maps only routes that exist on main. Missing workflow capabilities never use demo data. */
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
      if (Array.isArray(detail)) {
        for (const issue of detail as ValidationDetail[]) {
          const field = (issue.loc || []).filter(part => part !== 'body' && part !== 'query').join('.');
          if (field && issue.msg) fieldErrors[field] = issue.msg;
        }
      }
      const code: AppError['code'] = response.status === 404 ? 'not_found' : response.status === 409 ? 'conflict' : response.status === 429 ? 'rate_limited' : [400, 422].includes(response.status) ? 'validation' : 'upstream_failure';
      const message = typeof detail === 'string' ? detail : Object.values(fieldErrors).join(' · ') || `The backend returned an error (${response.status}).`;
      const error = new VolunteerAppError(code, message, Object.keys(fieldErrors).length ? fieldErrors : undefined);
      error.retryable = response.status === 429 || response.status >= 500;
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
    // Main does not persist type, IANA timezone, or lifecycle; these are display defaults only.
    return { id: record.id, title: record.title, type: 'Event', location: record.location || '',
      startsAt: record.starts_at, endsAt: record.ends_at, timeZone: this.timeZone,
      status: Date.parse(record.ends_at) <= this.now() ? 'completed' : 'published' };
  }
  private shift(record: ApiRole): Shift {
    return { id: record.id, eventId: record.event_id, role: record.name, capacity: record.slots_needed, startsAt: record.starts_at, endsAt: record.ends_at };
  }
  private volunteer(record: ApiUser): Volunteer {
    // Permission/preferences are unknown because the current API has no such fields.
    return { id: record.id, name: record.name, email: record.email, phone: record.phone || '', preferredRoles: [], textOptIn: false };
  }
  async listEvents(): Promise<Event[]> { return (await this.all<ApiEvent>('/events')).map(item => this.event(item)); }
  async createEvent(input: Omit<Event, 'id'>, shifts: Omit<Shift, 'id' | 'eventId'>[]): Promise<Event> {
    const event = await this.request<ApiEvent>('/events', 'POST', { title: input.title, location: input.location || null, starts_at: input.startsAt, ends_at: input.endsAt });
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
    const id = encodeURIComponent(eventId);
    const [event, roles, users] = await Promise.all([this.request<ApiEvent>(`/events/${id}`), this.request<ApiRole[]>(`/events/${id}/roles`), this.all<ApiUser>('/users')]);
    const shifts = roles.map(item => this.shift(item));
    const capacity = shifts.reduce((sum, item) => sum + item.capacity, 0);
    // No roster/count route exists yet. These placeholders must remain hidden by connection.roster.
    // Users are the global directory, not evidence of membership in this event.
    return { event: this.event(event), shifts, volunteers: users.map(item => this.volunteer(item)), participants: [],
      coverage: { capacity, confirmed: 0, unfilled: capacity, awaitingReply: 0, standby: 0 },
      shiftCoverage: shifts.map(shift => ({ shiftId: shift.id, capacity: shift.capacity, confirmed: 0, unfilled: shift.capacity })) };
  }
  async listVolunteers(): Promise<Volunteer[]> { return (await this.all<ApiUser>('/users')).map(item => this.volunteer(item)); }
  async registerVolunteer(input: Omit<Volunteer, 'id'>): Promise<{ volunteerId: string }> {
    if (!input.email?.trim()) throw new VolunteerAppError('validation', 'Email is required by the connected backend.', { email: 'Enter an email address.' });
    const user = await this.request<ApiUser>('/users', 'POST', { name: input.name, email: input.email.trim(), phone: input.phone.trim() || null });
    return { volunteerId: user.id };
  }
  private unavailable(feature: string): never {
    throw new VolunteerAppError('messaging_unavailable', `${feature} is not available in the current backend yet. Switch to the clearly labeled sample mode to explore it.`);
  }
  async addEventVolunteers(_eventId: string, _volunteerIds: string[], _pool: Participation['pool']): Promise<Participation[]> { return this.unavailable('Event participation'); }
  async createMessageDraft(_input: MessageDraftInput): Promise<MessageDraft> { return this.unavailable('Message campaigns'); }
  async dispatchMessage(_draftId: string): Promise<DispatchReceipt> { return this.unavailable('Message dispatch'); }
  async getDeliveries(_campaignId: string): Promise<Delivery[]> { return this.unavailable('Campaign delivery records'); }
  async loadSignupForm(_token: string): Promise<SignupForm> { return this.unavailable('Public signup forms'); }
  async submitSignupForm(_token: string, _input: SignupDetails): Promise<{ participantId: string; status: Participation['status'] }> { return this.unavailable('Public signup forms'); }
  async confirmAssignment(_eventId: string, _participantId: string, _shiftId: string): Promise<Participation> { return this.unavailable('Role assignments'); }
  async cancelParticipation(_eventId: string, _participantId: string): Promise<Participation> { return this.unavailable('Event participation'); }
}
