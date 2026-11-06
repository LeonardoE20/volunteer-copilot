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
  assert.deepEqual(calls[0].body, { title: event.title, location: event.location, starts_at: event.starts_at, ends_at: event.ends_at });
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
test('missing email and unsupported workflow operations never call guessed routes', async () => {
  let calls = 0; const api = new HttpVolunteerApp({ fetch: async () => { calls++; return reply({}); } });
  await assert.rejects(api.registerVolunteer({ name: 'Contact', phone: '+12025550100', preferredRoles: [], textOptIn: true }), /Email is required/);
  await assert.rejects(api.addEventVolunteers('event', ['user'], 'primary'), /not available/);
  await assert.rejects(api.dispatchMessage('draft'), /not available/);
  await assert.rejects(api.loadSignupForm('token'), /not available/);
  assert.equal(calls, 0);
});
test('partial event creation reports the created event and never deletes or repeats it', async () => {
  const methods: string[] = []; const api = new HttpVolunteerApp({ fetch: async (_url, init) => { methods.push(init?.method || 'GET'); return methods.length === 1 ? reply(event, 201) : reply({ detail: 'Role failed' }, 503); } });
  await assert.rejects(api.createEvent({ title: event.title, type: 'Event', location: event.location, startsAt: event.starts_at, endsAt: event.ends_at, timeZone: 'America/Los_Angeles', status: 'published' }, [{ role: 'Cook', capacity: 4, startsAt: event.starts_at, endsAt: event.ends_at }]), (error: unknown) => {
    assert.ok(error instanceof VolunteerAppError); assert.match(error.message, /Event created \(event-1\).*roles are incomplete/); assert.equal(error.retryable, false); return true;
  });
  assert.deepEqual(methods, ['POST', 'POST']);
});
test('HTTP workspace exposes actual role capacity without inventing roster records', async () => {
  const api = new HttpVolunteerApp({ fetch: async url => reply(String(url).includes('/users') ? [{ id: 'u1', name: 'Directory contact', email: 'contact@example.com', phone: null, created_at: event.created_at }] : String(url).endsWith('/roles') ? [role] : event) });
  const workspace = await api.getEventWorkspace(event.id);
  assert.equal(workspace.shifts[0].role, 'Cook'); assert.equal(workspace.coverage.capacity, 4);
  assert.deepEqual(workspace.participants, []); assert.equal(workspace.volunteers[0].email, 'contact@example.com');
});
