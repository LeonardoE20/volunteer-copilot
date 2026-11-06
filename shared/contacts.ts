// Parse the pasted club contact list. One person per line:
//   Name, phone or email, adult|student, past roles separated by ;
// Lines that cannot be read are reported back, not silently dropped.
import { ContactInput, LIMITS } from './schema';

export interface ContactParseResult {
  contacts: ContactInput[];
  errors: { line: number; text: string; reason: string }[];
}

export function parseContactList(text: string): ContactParseResult {
  const contacts: ContactInput[] = [];
  const errors: ContactParseResult['errors'] = [];
  const lines = text.split(/\r?\n/).slice(0, LIMITS.maxContacts + 50);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/\s*[,\t]\s*/);
    const [name = '', contact = '', type = '', ...rest] = parts;
    const isStudent = /^(student|youth|key ?club|teen|s)$/i.test(type.trim());
    const roles = (/^(adult|student|youth|key ?club|teen|a|s)$/i.test(type.trim()) ? rest : [type, ...rest])
      .join(';')
      .split(/\s*;\s*/)
      .filter(Boolean);
    const r = ContactInput.safeParse({ name, contact, isStudent, pastRoles: roles.slice(0, 10) });
    if (r.success) contacts.push(r.data);
    else errors.push({ line: i + 1, text: line.slice(0, 80), reason: r.error.issues[0]?.message ?? 'Could not read' });
  });
  return { contacts: contacts.slice(0, LIMITS.maxContacts), errors };
}
