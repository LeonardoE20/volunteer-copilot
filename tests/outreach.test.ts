import { describe, expect, it } from 'vitest';
import { finalizeText, isYouthSafe, planOutreach, rankCandidates, sendLinks, withTemplateText } from '../shared/outreach';
import type { Contact, EventRecord, Roster, Signup } from '../shared/schema';

const shifts = [
  { id: 'grid', role: 'Griddle', start: '07:00', end: '09:00', needed: 3, adultsOnly: false },
  { id: 'cash', role: 'Cash box', start: '07:00', end: '10:00', needed: 1, adultsOnly: true },
  { id: 'syrup', role: 'Syrup/tables', start: '07:00', end: '10:00', needed: 4, adultsOnly: false },
  { id: 'clean', role: 'Cleanup', start: '10:00', end: '13:00', needed: 2, adultsOnly: false },
];
const event = (advisorContact = 'advisor@example.org'): EventRecord => ({
  id: 'e',
  slug: 'abc12345',
  title: 'Pancake Breakfast',
  date: 'Sat the 14th',
  location: 'Hall',
  todos: [],
  advisorName: 'Ms. Ortiz',
  advisorContact,
  contactPreference: 'text',
  studentsWelcome: true,
  shifts,
  createdAt: '',
});
const c = (id: string, name: string, contact: string, isStudent: boolean, pastRoles: string[] = []): Contact => ({
  id,
  name,
  contact,
  isStudent,
  pastRoles,
});
const contacts = [
  c('1', 'Dave Sample', '(408) 555-0101', false, ['Griddle']),
  c('2', 'Linda Example', '(408) 555-0102', false, ['Cash box']),
  c('3', 'Tom Placeholder', '(408) 555-0103', false, ['Griddles']),
  c('4', 'Ray Demo', '(408) 555-0104', false, []),
  c('5', 'Maya', '(408) 555-0107', true, ['Tables']),
  c('6', 'Leo', '(408) 555-0108', true, []),
];
const su = (id: string, shiftId: string, contact: string, status: Signup['status'] = 'confirmed', isStudent = false): Signup => ({
  id,
  shiftId,
  name: id,
  contact,
  isStudent,
  status,
  createdAt: '',
});
const roster = (signups: Signup[] = [], advisor?: string): Roster => ({ event: event(advisor), signups, contacts });
const URL = 'https://example.org/e/abc12345';

describe('rankCandidates', () => {
  it('puts people who did the role before first', () => {
    const r = rankCandidates(roster(), 'grid');
    expect(r.slice(0, 2).map((x) => x.contact.name).sort()).toEqual(['Dave Sample', 'Tom Placeholder']);
  });
  it('never offers students for adults-only slots', () => {
    expect(rankCandidates(roster(), 'cash').some((x) => x.contact.isStudent)).toBe(false);
  });
  it('skips people already in this slot or busy in an overlapping slot', () => {
    const r = rankCandidates(roster([su('a', 'grid', '408-555-0101'), su('b', 'syrup', '(408) 555-0103')]), 'grid');
    const names = r.map((x) => x.contact.name);
    expect(names).not.toContain('Dave Sample');
    expect(names).not.toContain('Tom Placeholder');
  });
  it('still offers someone helping in a non-overlapping slot, but lower', () => {
    const r = rankCandidates(roster([su('a', 'clean', '(408) 555-0104')]), 'grid');
    expect(r.find((x) => x.contact.name === 'Ray Demo')?.why).toContain('already helping in another slot');
  });
  it('does not re-ask someone who dropped out', () => {
    const r = rankCandidates(roster([su('a', 'grid', '(408) 555-0103', 'dropped')]), 'grid');
    expect(r.map((x) => x.contact.name)).not.toContain('Tom Placeholder');
  });
});

describe('youth-safe rule', () => {
  it('puts all students in one group draft with the advisor', () => {
    const drafts = withTemplateText(planOutreach(roster(), 'syrup', 'nudge', URL));
    const studentDrafts = drafts.filter((d) => d.recipients.some((r) => r.isStudent));
    expect(studentDrafts).toHaveLength(1);
    const g = studentDrafts[0];
    expect(g.audience).toBe('group');
    expect(g.includesAdvisor).toBe(true);
    expect(g.recipients.some((r) => r.isAdvisor && r.contact === 'advisor@example.org')).toBe(true);
    expect(g.text).toContain('Ms. Ortiz is on this message');
    expect(drafts.every(isYouthSafe)).toBe(true);
  });
  it('never makes a one-to-one draft to a student, for any shift or kind', () => {
    for (const s of shifts) {
      for (const kind of ['nudge', 'backfill'] as const) {
        for (const d of withTemplateText(planOutreach(roster(), s.id, kind, URL))) {
          if (d.recipients.some((r) => r.isStudent)) expect(d.audience).toBe('group');
          if (d.audience === 'individual') expect(d.recipients).toHaveLength(1);
        }
      }
    }
  });
  it('blocks student drafts when there is no advisor contact, and offers no send link', () => {
    const drafts = withTemplateText(planOutreach(roster([], ''), 'syrup', 'nudge', URL));
    const g = drafts.find((d) => d.recipients.some((r) => r.isStudent))!;
    expect(g.blocked).toBeTruthy();
    expect(isYouthSafe(g)).toBe(false);
    expect(sendLinks(g)).toEqual({});
  });
  it('only offers a group text when every recipient, advisor included, has a phone', () => {
    const drafts = withTemplateText(planOutreach(roster([], '(408) 555-0150'), 'syrup', 'nudge', URL));
    const g = drafts.find((d) => d.audience === 'group')!;
    expect(sendLinks(g).sms).toContain('4085550150');
    const mixed = withTemplateText(planOutreach(roster(), 'syrup', 'nudge', URL)).find((d) => d.audience === 'group')!;
    expect(sendLinks(mixed).sms).toBeUndefined();
  });
});

describe('planOutreach', () => {
  it('returns nothing for a full shift', () => {
    const full = roster([su('a', 'cash', '(408) 555-0199')]);
    expect(planOutreach(full, 'cash', 'nudge', URL)).toEqual([]);
  });
  it('writes backfill wording for backfill', () => {
    const d = withTemplateText(planOutreach(roster(), 'grid', 'backfill', URL))[0];
    expect(d.text).toMatch(/drop out/);
    expect(d.text.endsWith(URL)).toBe(true);
  });
});

describe('finalizeText', () => {
  it('strips any links the model invented and appends ours', () => {
    const t = finalizeText('Click http://evil.example/x now <b>', URL);
    expect(t).not.toContain('evil');
    expect(t).not.toContain('<');
    expect(t.endsWith(URL)).toBe(true);
  });
});

describe('finalizeText strips contact details the model might invent', () => {
  it('removes emails, bare domains and phone numbers', () => {
    const t = finalizeText('Reply to evil@x.com or bit.ly/abc or call (408) 555-0199 today', URL);
    expect(t).not.toMatch(/evil|bit\.ly|555-0199/);
    expect(t.endsWith(URL)).toBe(true);
  });
});
