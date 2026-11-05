// Shared data model and validation, used by the browser and the serverless functions.
import { z } from 'zod';

export const LIMITS = {
  noteChars: 4000,
  nameChars: 60,
  contactChars: 80,
  roleChars: 60,
  titleChars: 120,
  todoChars: 200,
  maxShifts: 40,
  maxTodos: 20,
  maxNeeded: 50,
  maxContacts: 300,
  messageChars: 480,
} as const;

/** Strip control characters and trim. Used on every free-text field. */
export function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

const text = (max: number) => z.string().transform(clean).pipe(z.string().max(max));
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function contactKind(c: string): 'phone' | 'email' | null {
  const v = c.trim();
  if (EMAIL_RE.test(v)) return 'email';
  if (PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 7) return 'phone';
  return null;
}

export const contactField = text(LIMITS.contactChars).refine((c) => contactKind(c) !== null, {
  message: 'Enter a phone number or an email address',
});

// ---------- What the parser (AI or rule-based) returns ----------
export const ParsedShift = z.object({
  role: text(LIMITS.roleChars).pipe(z.string().min(1)),
  start: time,
  end: time,
  needed: z.number().int().min(1).max(LIMITS.maxNeeded),
  adultsOnly: z.boolean().default(false),
});
export type ParsedShift = z.infer<typeof ParsedShift>;

export const ParsedEvent = z.object({
  title: text(LIMITS.titleChars).pipe(z.string().min(1)),
  date: text(40).default(''),
  location: text(LIMITS.titleChars).default(''),
  shifts: z.array(ParsedShift).min(1).max(LIMITS.maxShifts),
  todos: z.array(text(LIMITS.todoChars)).max(LIMITS.maxTodos).default([]),
  advisorName: text(LIMITS.nameChars).default(''),
  contactPreference: z.enum(['text', 'email', 'any']).default('any'),
  studentsWelcome: z.boolean().default(true),
});
export type ParsedEvent = z.infer<typeof ParsedEvent>;

// ---------- Stored records ----------
export type SignupStatus = 'confirmed' | 'dropped' | 'no_show' | 'attended';

export interface Shift extends ParsedShift {
  id: string;
}

export interface EventRecord {
  id: string;
  slug: string;
  title: string;
  date: string;
  location: string;
  todos: string[];
  advisorName: string;
  advisorContact: string;
  contactPreference: 'text' | 'email' | 'any';
  studentsWelcome: boolean;
  shifts: Shift[];
  createdAt: string;
}

export interface Signup {
  id: string;
  shiftId: string;
  name: string;
  contact: string;
  isStudent: boolean;
  status: SignupStatus;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  contact: string;
  isStudent: boolean;
  pastRoles: string[];
}

/** What anyone with the public link may see: no names, no contact details. */
export interface PublicEvent {
  slug: string;
  title: string;
  date: string;
  location: string;
  studentsWelcome: boolean;
  shifts: (Shift & { filled: number })[];
}

/** What the coordinator sees with the private link. */
export interface Roster {
  event: EventRecord;
  signups: Signup[];
  contacts: Contact[];
}

// ---------- Input schemas for writes ----------
export const SignupInput = z.object({
  shiftId: z.string().min(1).max(64),
  name: text(LIMITS.nameChars).pipe(z.string().min(1, 'Please enter your name')),
  contact: contactField,
  isStudent: z.boolean().default(false),
  // Honeypot: real people never fill this in.
  website: z.string().max(0).optional(),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const ContactInput = z.object({
  name: text(LIMITS.nameChars).pipe(z.string().min(1)),
  contact: contactField,
  isStudent: z.boolean().default(false),
  pastRoles: z.array(text(LIMITS.roleChars)).max(10).default([]),
});
export type ContactInput = z.infer<typeof ContactInput>;

export const CreateEventInput = z.object({
  event: ParsedEvent,
  advisorContact: z.union([z.literal(''), contactField]).default(''),
  contacts: z.array(ContactInput).max(LIMITS.maxContacts).default([]),
});
export type CreateEventInput = z.infer<typeof CreateEventInput>;

export const NoteInput = z.object({
  note: z.string().transform(clean).pipe(z.string().min(10, 'Paste a longer note').max(LIMITS.noteChars)),
});

export function firstError(err: z.ZodError): string {
  const i = err.issues[0];
  return i ? `${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid input';
}

// ---------- Outreach (nudges and backfill) ----------
export type OutreachKind = 'nudge' | 'backfill';

export interface Recipient {
  name: string;
  contact: string;
  isStudent: boolean;
  isAdvisor?: boolean;
}

/**
 * One message to send. `group` drafts go to several people at once. Any draft that reaches a
 * student is always a group draft that includes the advisor (youth-protection rule).
 */
export interface Draft {
  id: string;
  kind: OutreachKind;
  shiftId: string;
  audience: 'individual' | 'group';
  recipients: Recipient[];
  includesAdvisor: boolean;
  text: string;
  reason: string;
  /** Set when the draft must not be sent (for example, students but no advisor contact). */
  blocked?: string;
}
