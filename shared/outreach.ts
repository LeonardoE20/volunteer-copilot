// Who to ask, and how. This is plain code, not AI, so it is predictable and testable.
// The AI (when switched on) only rewrites the wording of each message.
//
// Youth-safe rule (our understanding of Kiwanis Youth Protection guidance, to be confirmed
// with the partner): an adult never messages a student one-to-one. Every draft that reaches a
// student is a group message that also includes the advisor. Without an advisor contact,
// student drafts are blocked.
import { newId } from './ids';
import { contactKind, LIMITS, type Contact, type Draft, type OutreachKind, type Recipient, type Roster, type Shift } from './schema';
import { counts, filledFor, formatTime } from './roster';

export interface Candidate {
  contact: Contact;
  score: number;
  why: string[];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2)
    .map((w) => w.replace(/s$/, '').replace(/e$/, ''));

export function roleMatches(pastRole: string, role: string): boolean {
  const a = new Set(words(pastRole));
  return words(role).some((w) => a.has(w));
}

const overlaps = (a: Shift, b: Shift) => a.start < b.end && b.start < a.end;
/** Same person? Phones compare by their last 10 digits, emails case-insensitively. */
export function sameContact(a: string, b: string): boolean {
  if (contactKind(a) === 'phone' && contactKind(b) === 'phone') {
    return a.replace(/\D/g, '').slice(-10) === b.replace(/\D/g, '').slice(-10);
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Rank club contacts for one shift. Highest score first. */
export function rankCandidates(roster: Roster, shiftId: string): Candidate[] {
  const { event, signups, contacts } = roster;
  const shift = event.shifts.find((s) => s.id === shiftId);
  if (!shift) return [];
  const out: Candidate[] = [];
  for (const c of contacts) {
    if (shift.adultsOnly && c.isStudent) continue;
    const theirs = signups.filter((s) => sameContact(s.contact, c.contact));
    // Never re-ask someone who already dropped out of or missed this event.
    if (theirs.some((s) => s.status === 'dropped' || s.status === 'no_show')) continue;
    const active = theirs.filter(counts);
    if (active.some((s) => s.shiftId === shift.id)) continue;
    const busy = active.some((s) => {
      const other = event.shifts.find((x) => x.id === s.shiftId);
      return other ? overlaps(other, shift) : false;
    });
    if (busy) continue;

    let score = 0;
    const why: string[] = [];
    if (c.pastRoles.some((r) => roleMatches(r, shift.role))) {
      score += 3;
      why.push(`has done ${shift.role.toLowerCase()} before`);
    }
    if (active.length === 0) {
      score += 2;
      why.push('not signed up for anything yet');
    } else {
      score -= 1;
      why.push('already helping in another slot');
    }
    out.push({ contact: c, score, why });
  }
  return out.sort((a, b) => b.score - a.score || a.contact.name.localeCompare(b.contact.name));
}

export interface MessageContext {
  eventTitle: string;
  eventDate: string;
  shift: Shift;
  missing: number;
  kind: OutreachKind;
  signupUrl: string;
  advisorName: string;
}

const firstName = (n: string) => n.split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '') || n;

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function when(ctx: MessageContext) {
  const t = `${formatTime(ctx.shift.start)}–${formatTime(ctx.shift.end)}`;
  return ctx.eventDate ? `${t} on ${ctx.eventDate}` : t;
}

/** Template wording (demo mode, and the fallback when AI output is unusable). */
export function templateText(ctx: MessageContext, recipients: Recipient[], why: string): string {
  const students = recipients.filter((r) => r.isStudent);
  const role = ctx.shift.role;
  const need = ctx.missing === 1 ? '1 more person' : `${ctx.missing} more people`;
  if (students.length) {
    const advisor = ctx.advisorName || 'your advisor';
    const opener = ctx.kind === 'backfill' ? 'A spot just opened up' : 'Service hours available';
    return `Hi ${listNames(students.map((s) => firstName(s.name)))} (${advisor} is on this message): ${opener} at the ${ctx.eventTitle}. We need ${need} for ${role}, ${when(ctx)}. If you can help, pick the slot here:`;
  }
  const name = firstName(recipients[0]?.name ?? 'there');
  const reason = why ? ` You ${why.replace(/^has /, 'have ')}, so I thought of you.` : '';
  if (ctx.kind === 'backfill') {
    return `Hi ${name}, someone just had to drop out of the ${ctx.eventTitle}. We need ${need} for ${role}, ${when(ctx)}.${reason} Could you cover? Grab the slot here:`;
  }
  return `Hi ${name}, we're still short ${need} for ${role} at the ${ctx.eventTitle}, ${when(ctx)}.${reason} Can you help? Grab the slot here:`;
}

/** Remove links and odd characters from model-written text, cap length, then add our link. */
export function finalizeText(body: string, signupUrl: string): string {
  const cleaned = body
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/\S+@\S+/g, '')
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|ly|co|me|app|xyz|info|biz|us|link|site)\b\S*/gi, '')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.messageChars - signupUrl.length - 1);
  return `${cleaned} ${signupUrl}`;
}

export interface PlannedDraft extends Omit<Draft, 'text'> {
  ctx: MessageContext;
  why: string;
}

/**
 * Decide recipients and grouping for one shift. Adults get individual drafts; all chosen
 * students share one group draft that includes the advisor.
 */
export function planOutreach(roster: Roster, shiftId: string, kind: OutreachKind, signupUrl: string): PlannedDraft[] {
  const { event, signups } = roster;
  const shift = event.shifts.find((s) => s.id === shiftId);
  if (!shift) return [];
  const missing = Math.max(0, shift.needed - filledFor(shift.id, signups));
  if (missing === 0) return [];
  const ranked = rankCandidates(roster, shiftId);
  const limit = Math.min(8, Math.max(3, missing * 2));
  const chosen = ranked.slice(0, limit);
  const ctx: MessageContext = {
    eventTitle: event.title,
    eventDate: event.date,
    shift,
    missing,
    kind,
    signupUrl,
    advisorName: event.advisorName,
  };

  const plans: PlannedDraft[] = [];
  for (const c of chosen.filter((x) => !x.contact.isStudent)) {
    plans.push({
      id: newId(),
      kind,
      shiftId,
      audience: 'individual',
      recipients: [{ name: c.contact.name, contact: c.contact.contact, isStudent: false }],
      includesAdvisor: false,
      reason: c.why.join('; '),
      why: c.why[0] && c.why[0].startsWith('has done') ? c.why[0] : '',
      ctx,
    });
  }
  const students = chosen.filter((x) => x.contact.isStudent);
  if (students.length) {
    const hasAdvisor = Boolean(event.advisorContact && contactKind(event.advisorContact));
    const recipients: Recipient[] = students.map((s) => ({ name: s.contact.name, contact: s.contact.contact, isStudent: true }));
    if (hasAdvisor) {
      recipients.push({ name: event.advisorName || 'Advisor', contact: event.advisorContact, isStudent: false, isAdvisor: true });
    }
    plans.push({
      id: newId(),
      kind,
      shiftId,
      audience: 'group',
      recipients,
      includesAdvisor: hasAdvisor,
      reason: hasAdvisor
        ? 'Students are messaged together, with the advisor included (youth-safe rule).'
        : 'Blocked: add the advisor’s contact first. Students are never messaged one-to-one.',
      blocked: hasAdvisor ? undefined : 'Add the advisor’s phone or email (Advisor section below) before messaging students.',
      why: '',
      ctx,
    });
  }
  return plans;
}

export function withTemplateText(plans: PlannedDraft[]): Draft[] {
  return plans.map(({ ctx, why, ...d }) => ({ ...d, text: finalizeText(templateText(ctx, d.recipients, why), ctx.signupUrl) }));
}

/** Safety net used everywhere a draft is shown or sent. */
export function isYouthSafe(d: Draft): boolean {
  const hasStudent = d.recipients.some((r) => r.isStudent);
  if (!hasStudent) return true;
  return d.audience === 'group' && d.includesAdvisor && d.recipients.some((r) => r.isAdvisor) && !d.blocked;
}

/** Links that open the coordinator's own phone or mail app. Nothing is sent automatically. */
export function sendLinks(d: Draft): { sms?: string; email?: string } {
  if (!isYouthSafe(d)) return {};
  const phones = d.recipients.filter((r) => contactKind(r.contact) === 'phone').map((r) => r.contact.replace(/[^\d+]/g, ''));
  const emails = d.recipients.filter((r) => contactKind(r.contact) === 'email').map((r) => r.contact.trim());
  const body = encodeURIComponent(d.text);
  const out: { sms?: string; email?: string } = {};
  // A group message is only offered when one channel reaches EVERY recipient, so the advisor
  // can never be silently left off a message to students.
  if (phones.length === d.recipients.length) out.sms = `sms:${phones.join(',')}?&body=${body}`;
  if (emails.length === d.recipients.length) out.email = `mailto:${emails.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent('Volunteer slot open')}&body=${body}`;
  return out;
}
