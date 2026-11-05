import { describe, expect, it } from 'vitest';
import { LocalBackend, MemoryStore } from '../src/data/local';
import { mockAi } from '../src/data/mockAi';
import type { ParsedEvent } from '../shared/schema';

const event: ParsedEvent = {
  title: 'Test breakfast',
  date: 'Sat',
  location: 'Hall',
  shifts: [
    { role: 'Griddle', start: '07:00', end: '09:00', needed: 2, adultsOnly: false },
    { role: 'Cash box', start: '07:00', end: '10:00', needed: 1, adultsOnly: true },
  ],
  todos: [],
  advisorName: 'Ms. Advisor',
  contactPreference: 'text',
  studentsWelcome: true,
};

async function setup() {
  const b = new LocalBackend(new MemoryStore(), mockAi);
  const { slug, token } = await b.createEvent({ event, advisorContact: '', contacts: [] });
  const pub = (await b.getPublicEvent(slug))!;
  return { b, slug, token, pub };
}

describe('LocalBackend', () => {
  it('creates an event and exposes only public fields', async () => {
    const { b, slug, pub } = await setup();
    await b.signUp(slug, { shiftId: pub.shifts[0].id, name: 'A', contact: 'a@example.org', isStudent: false });
    const again = (await b.getPublicEvent(slug))!;
    expect(again.shifts[0].filled).toBe(1);
    expect(JSON.stringify(again)).not.toContain('a@example.org');
  });

  it('rejects a wrong coordinator token', async () => {
    const { b, slug } = await setup();
    await expect(b.getRoster(slug, 'wrong')).rejects.toThrow(/not valid/);
  });

  it('stops overbooking and keeps students out of adults-only slots', async () => {
    const { b, slug, pub } = await setup();
    const cash = pub.shifts[1].id;
    await expect(
      b.signUp(slug, { shiftId: cash, name: 'Kid', contact: '(408) 555-0199', isStudent: true }),
    ).rejects.toThrow(/adults only/);
    await b.signUp(slug, { shiftId: cash, name: 'Adult', contact: '(408) 555-0198', isStudent: false });
    await expect(
      b.signUp(slug, { shiftId: cash, name: 'Adult2', contact: '(408) 555-0197', isStudent: false }),
    ).rejects.toThrow(/filled up/);
  });

  it('lets a volunteer remove themselves only with their own token', async () => {
    const { b, slug, token, pub } = await setup();
    const r = await b.signUp(slug, { shiftId: pub.shifts[0].id, name: 'A', contact: 'a@example.org', isStudent: false });
    await expect(b.removeSignup(slug, r.signupId, 'nope')).rejects.toThrow();
    await b.removeSignup(slug, r.signupId, r.removeToken);
    expect((await b.getRoster(slug, token)).signups).toHaveLength(0);
  });

  it('rejects invalid contact details', async () => {
    const { b, slug, pub } = await setup();
    await expect(
      b.signUp(slug, { shiftId: pub.shifts[0].id, name: 'A', contact: 'not a contact', isStudent: false }),
    ).rejects.toThrow(/phone number or an email/);
  });
});

describe('security hardening', () => {
  it('blocks the same person taking more than 3 slots, and duplicate sign-ups', async () => {
    const b = new LocalBackend(new MemoryStore(), mockAi);
    const many = { ...event, shifts: Array.from({ length: 5 }, (_, i) => ({ role: `R${i}`, start: '07:00', end: '08:00', needed: 5, adultsOnly: false })) };
    const { slug } = await b.createEvent({ event: many, advisorContact: '', contacts: [] });
    const ids = (await b.getPublicEvent(slug))!.shifts.map((s) => s.id);
    const me = { name: 'A', contact: '+1 (408) 555-0101', isStudent: false };
    await b.signUp(slug, { ...me, shiftId: ids[0] });
    await expect(b.signUp(slug, { ...me, contact: '408-555-0101', shiftId: ids[0] })).rejects.toThrow(/already signed up/);
    await b.signUp(slug, { ...me, shiftId: ids[1] });
    await b.signUp(slug, { ...me, shiftId: ids[2] });
    await expect(b.signUp(slug, { ...me, shiftId: ids[3] })).rejects.toThrow(/3 slots/);
  });
  it('refuses student sign-ups when the event does not take students', async () => {
    const b = new LocalBackend(new MemoryStore(), mockAi);
    const { slug } = await b.createEvent({ event: { ...event, studentsWelcome: false }, advisorContact: '', contacts: [] });
    const id = (await b.getPublicEvent(slug))!.shifts[0].id;
    await expect(b.signUp(slug, { shiftId: id, name: 'K', contact: 'k@example.org', isStudent: true })).rejects.toThrow(/not taking student/);
  });
  it('rejects shifts that end before they start, and emails that could inject mailto fields', async () => {
    const b = new LocalBackend(new MemoryStore(), mockAi);
    const bad = { ...event, shifts: [{ role: 'X', start: '09:00', end: '08:00', needed: 1, adultsOnly: false }] };
    await expect(b.createEvent({ event: bad, advisorContact: '', contacts: [] })).rejects.toThrow(/after start/);
    await expect(b.createEvent({ event, advisorContact: 'a@b.co?bcc=x@y.com', contacts: [] })).rejects.toThrow();
  });
});
