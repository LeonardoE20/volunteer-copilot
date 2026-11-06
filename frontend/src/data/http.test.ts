import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpVolunteerApp } from './http.ts';
import { VolunteerAppError } from './demo.ts';
import type { Event } from '../../../contracts/volunteer-contract.ts';

const event = { id: 'event-1', title: 'Real test event', description: null, location: 'Community stadium', starts_at: '2026-11-14T23:00:00Z', ends_at: '2026-11-15T04:00:00Z', created_at: '2026-11-06T20:00:00Z' };
const role = { id: 'role-1', event_id: event.id, name: 'Cook', slots_needed: 4, starts_at: event.starts_at, ends_at: event.ends_at, created_at: event.created_at };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('HTTP event and user pagination maps actual snake_case records', async () => {
  const calls: string[] = [];
  const api = new HttpVolunteerApp({ now: () => Date.parse('2026-11-06'), fetch: async url => {
    calls.push(String(url));
    if (String(url).includes('/users')) return reply([{ id: 'u1', name: 'Contact', email: 'contact@example.com', phone: null, created_at: event.created_at }]);
    return reply(String(url).endsWith('offset=0') ? Array.from({ length: 500 }, (_, i) => ({ ...event, id: `e${i}` })) : [event]);
  } });
  const events = await api.listEvents(); assert.equal(events.length, 501); assert.equal(events[0].startsAt, event.starts_at);
  assert.equal(events[0].timeZone, 'America/Los_Angeles'); assert.equal(events[0].type, 'Event');
  assert.equal(calls[1], '/api/v1/events?limit=500&offset=500');
  const [user] = await api.listVolunteers(); assert.equal(user.email, 'contact@example.com'); assert.equal(user.phone, ''); assert.equal(user.textOptIn, false);
});
test('HTTP event creation sends only supported event/role fields', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const api = new HttpVolunteerApp({ fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return reply(calls.length === 1 ? event : role, 201); } });
  const input: Omit<Event, 'id'> = { title: event.title, type: 'Stadium', location: event.location, startsAt: event.starts_at, endsAt: event.ends_at, timeZone: 'America/Los_Angeles', status: 'draft' };
  await api.createEvent(input, [{ role: 'Cook', capacity: 4, startsAt: event.starts_at, endsAt: event.ends_at }]);
  assert.deepEqual(calls[0].body, { title: event.title, location: event.location, starts_at: event.starts_at, ends_at: event.ends_at, timezone: 'America/Los_Angeles', event_type: 'Stadium', status: 'draft' });
  assert.deepEqual(calls[1], { url: '/api/v1/events/event-1/roles', body: { name: 'Cook', slots_needed: 4, starts_at: event.starts_at, ends_at: event.ends_at } });
});
test('FastAPI 422 field errors and network failures become application errors', async () => {
  const api = new HttpVolunteerApp({ fetch: async () => reply({ detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] }, 422) });
  await assert.rejects(api.registerVolunteer({ name: 'Contact', email: 'invalid', phone: '', preferredRoles: [], textOptIn: false }), (error: unknown) => {
    assert.ok(error instanceof VolunteerAppError); assert.equal(error.code, 'validation'); assert.equal(error.fieldErrors?.email, 'value is not a valid email address'); return true;
  });
  const offline = new HttpVolunteerApp({ fetch: async () => { throw Error('offline'); } });
  await assert.rejects(offline.listEvents(), (error: unknown) => error instanceof VolunteerAppError && error.retryable);
});
test('missing email does not call the backend, and workflow routes use the published paths', async () => {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const api = new HttpVolunteerApp({ fetch: async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (String(url).endsWith('/dispatch')) return reply({ draft_id: 'draft-1', status: 'accepted', scheduled_for: null, deliveries: [{ id: 'del-1', event_id: 'event', participation_id: 'part', draft_id: 'draft-1', provider_message_id: 'm1', state: 'sent', error: null }] });
    if (String(url).includes('/participations')) return reply([{ id: 'part', event_id: 'event', user_id: 'user', pool: 'primary', status: 'not_invited', preferred_shift_ids: [], confirmed_shift_ids: [], availability: null }], 201);
    return reply({ event, participant_id: 'part', volunteer_name: 'Contact', shifts: [] });
  } });
  await assert.rejects(api.registerVolunteer({ name: 'Contact', phone: '+12025550100', preferredRoles: [], textOptIn: true }), /Email is required/);
  assert.equal(calls.length, 0);
  const [added] = await api.addEventVolunteers('event', ['user'], 'primary');
  assert.equal(added.volunteerId, 'user');
  assert.equal(calls[0].url, '/api/v1/events/event/participations');
  const receipt = await api.dispatchMessage('draft-1');
  assert.equal(calls[1].url, '/api/v1/drafts/draft-1/dispatch');
  assert.deepEqual(receipt, { campaignId: 'draft-1', state: 'queued', deliveryIds: ['del-1'] });
  const form = await api.loadSignupForm('token');
  assert.equal(calls[2].url, '/api/v1/forms/token');
  assert.equal(form.volunteerName, 'Contact');
});
test('partial event creation reports the created event and never deletes or repeats it', async () => {
  const methods: string[] = []; const api = new HttpVolunteerApp({ fetch: async (_url, init) => { methods.push(init?.method || 'GET'); return methods.length === 1 ? reply(event, 201) : reply({ detail: 'Role failed' }, 503); } });
  await assert.rejects(api.createEvent({ title: event.title, type: 'Event', location: event.location, startsAt: event.starts_at, endsAt: event.ends_at, timeZone: 'America/Los_Angeles', status: 'published' }, [{ role: 'Cook', capacity: 4, startsAt: event.starts_at, endsAt: event.ends_at }]), (error: unknown) => {
    assert.ok(error instanceof VolunteerAppError); assert.match(error.message, /Event created \(event-1\).*roles are incomplete/); assert.equal(error.retryable, false); return true;
  });
  assert.deepEqual(methods, ['POST', 'POST']);
});
test('HTTP workspace maps roster counts and does not treat the directory as the roster', async () => {
  const api = new HttpVolunteerApp({ fetch: async url => {
    assert.equal(String(url), `/api/v1/events/${event.id}/workspace`);
    return reply({ event, shifts: [{ ...role, capacity: role.slots_needed, coverage: { confirmed: 1, unfilled: 3, awaiting_reply: 2, standby: 1 } }],
      volunteers: [{ id: 'u1', name: 'Directory contact', email: 'contact@example.com', phone: null, text_opt_in: true, role_preferences: ['Cook'], created_at: event.created_at }],
      participations: [{ id: 'p1', event_id: event.id, user_id: 'u1', pool: 'primary', status: 'invited', preferred_shift_ids: [], confirmed_shift_ids: [], availability: null }] });
  } });
  const workspace = await api.getEventWorkspace(event.id);
  assert.equal(workspace.shifts[0].role, 'Cook'); assert.equal(workspace.coverage.capacity, 4);
  assert.equal(workspace.coverage.confirmed, 1); assert.equal(workspace.coverage.awaitingReply, 2);
  assert.equal(workspace.participants[0].volunteerId, 'u1'); assert.equal(workspace.volunteers[0].textOptIn, true);
});
