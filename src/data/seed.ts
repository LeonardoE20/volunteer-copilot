// Demo seed data. Every name is invented and every phone number uses the 555-01xx range,
// which is reserved for fiction. Emails use example.org. No real people.
import type { ContactInput } from '../../shared/schema';

/** Illustrative messy note (invented; not from any real club). */
export const SAMPLE_NOTE = `Sat the 14th, pancake breakfast at the church hall?? setup starts 6:30 (Dave has keys, I think). Need ~6 on griddles 7-9, 4 on tables/clean 7-10, 2 at the cash box 7-10 (adults only, Linda said). Key Club kids can do syrup/tables, need like 8, they get hours, ask Ms. Ortiz to sign sheet after. Bring aprons. Tom might bail, his knee. Need coffee urn from the storage unit, Ray has the code. Last time we ran out of sausage by 9:30, order 20 lbs more. Text me not email. Tell Key Club by Wed so they can get rides. Cleanup 10-1, done by 1 for the 1:30 wedding.`;

export const SAMPLE_ADVISOR_CONTACT = '(408) 555-0150';

export const SAMPLE_CONTACTS: ContactInput[] = [
  { name: 'Dave Sample', contact: '(408) 555-0101', isStudent: false, pastRoles: ['Setup', 'Griddle'] },
  { name: 'Linda Example', contact: '(408) 555-0102', isStudent: false, pastRoles: ['Cash box'] },
  { name: 'Tom Placeholder', contact: '(408) 555-0103', isStudent: false, pastRoles: ['Griddle'] },
  { name: 'Ray Demo', contact: '(408) 555-0104', isStudent: false, pastRoles: ['Setup', 'Cleanup'] },
  { name: 'Grace Fictional', contact: 'grace@example.org', isStudent: false, pastRoles: ['Griddle', 'Cash box'] },
  { name: 'Hank Testcase', contact: '(408) 555-0106', isStudent: false, pastRoles: ['Tables'] },
  { name: 'Maya (student)', contact: '(408) 555-0107', isStudent: true, pastRoles: ['Tables', 'Syrup'] },
  { name: 'Leo (student)', contact: '(408) 555-0108', isStudent: true, pastRoles: ['Tables'] },
  { name: 'Ana (student)', contact: '(408) 555-0109', isStudent: true, pastRoles: ['Syrup'] },
  { name: 'Sam (student)', contact: '(408) 555-0110', isStudent: true, pastRoles: [] },
];

/** Paste format for the contact box: one per line, "Name, phone or email, adult|student, roles; roles". */
export const SAMPLE_CONTACTS_TEXT = SAMPLE_CONTACTS.map(
  (c) => `${c.name}, ${c.contact}, ${c.isStudent ? 'student' : 'adult'}, ${c.pastRoles.join('; ')}`,
).join('\n');
