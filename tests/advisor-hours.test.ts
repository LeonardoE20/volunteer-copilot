import { describe, expect, it } from 'vitest';
import { LocalBackend, MemoryStore } from '../src/data/local';
import { mockAi } from '../src/data/mockAi';
import type { ParsedEvent } from '../shared/schema';

const event: ParsedEvent = {
  title: 'Breakfast', date: 'Sat', location: 'Hall', todos: [], advisorName: 'Ms. Ortiz', contactPreference: 'any', studentsWelcome: true,
  shifts: [{ role: 'Tables', start: '07:00', end: '10:00', needed: 5, adultsOnly: false }],
};

async function setup() {
  const b = new LocalBackend(new MemoryStore(), mockAi);
  const { slug, token } = await b.createEvent({ event, advisorContact: '', contacts: [] });
  const shiftId = (await b.getPublicEvent(slug))!.shifts[0].id;
  const maya = await b.signUp(slug, { shiftId, name: 'Maya', contact: '(408) 555-0107', isStudent: true });
  const leo = await b.signUp(slug, { shiftId, name: 'Leo', contact: '(408) 555-0108', isStudent: true });
  const adult = await b.signUp(slug, { shiftId, name: 'Dave', contact: '(408) 555-0101', isStudent: false });
  await b.setStatus(slug, token, maya.signupId, 'attended');
  await b.setStatus(slug, token, adult.signupId, 'attended');
  const { advisorToken } = await b.createAdvisorLink(slug, token);
  return { b, slug, token, advisorToken, maya, leo, adult };
}

describe('advisor tap-to-confirm hours', () => {
  it('shows only attended students, with hours and no contact details', async () => {
    const { b, slug, advisorToken } = await setup();
    const h = await b.getAdvisorHours(slug, advisorToken);
    expect(h.rows.map((r) => r.name)).toEqual(['Maya']);
    expect(h.rows[0].hours).toBe(3);
    expect(JSON.stringify(h)).not.toMatch(/555-01/);
  });

  it('records who confirmed, and the coordinator sees it', async () => {
    const { b, slug, token, advisorToken, maya } = await setup();
    await b.confirmHours(slug, advisorToken, [maya.signupId], 'Ms. Ortiz');
    const s = (await b.getRoster(slug, token)).signups.find((x) => x.id === maya.signupId)!;
    expect(s.hoursConfirmed?.by).toBe('Ms. Ortiz');
    expect((await b.getAdvisorHours(slug, advisorToken)).rows[0].confirmed?.by).toBe('Ms. Ortiz');
  });

  it('refuses wrong tokens, the coordinator token, and old links', async () => {
    const { b, slug, token, advisorToken } = await setup();
    await expect(b.getAdvisorHours(slug, 'wrong')).rejects.toThrow(/not valid/);
    await expect(b.getAdvisorHours(slug, token)).rejects.toThrow(/not valid/);
    await b.createAdvisorLink(slug, token);
    await expect(b.getAdvisorHours(slug, advisorToken)).rejects.toThrow(/not valid/);
  });

  it('cannot confirm adults, students who did not attend, or without a typed name', async () => {
    const { b, slug, advisorToken, leo, adult, maya } = await setup();
    await expect(b.confirmHours(slug, advisorToken, [leo.signupId], 'Ms. Ortiz')).rejects.toThrow(/attended students/);
    await expect(b.confirmHours(slug, advisorToken, [adult.signupId], 'Ms. Ortiz')).rejects.toThrow(/attended students/);
    await expect(b.confirmHours(slug, advisorToken, [maya.signupId], ' ')).rejects.toThrow(/Type your name/);
  });

  it('clears a confirmation if the coordinator later changes the student away from attended', async () => {
    const { b, slug, token, advisorToken, maya } = await setup();
    await b.confirmHours(slug, advisorToken, [maya.signupId], 'Ms. Ortiz');
    await b.setStatus(slug, token, maya.signupId, 'no_show');
    await b.setStatus(slug, token, maya.signupId, 'attended');
    expect((await b.getAdvisorHours(slug, advisorToken)).rows[0].confirmed).toBeUndefined();
  });
});
