// Rule-based note parser: the "mock AI" used in demo mode and as the fallback when the
// real AI is unavailable or returns something invalid. It is deliberately simple and
// predictable; the coordinator always reviews and edits the draft before publishing.
import { LIMITS, ParsedEvent, type ParsedShift } from './schema';

const EVENT_WORDS = [
  'pancake breakfast',
  'spaghetti dinner',
  'crab feed',
  'food drive',
  'coat drive',
  'toy drive',
  'book drive',
  'park cleanup',
  'beach cleanup',
  'creek cleanup',
  'car wash',
  'fun run',
  'festival',
  'fundraiser',
  'carnival',
  'bake sale',
  'blood drive',
  'parade',
  'dinner',
  'breakfast',
  'auction',
  'cleanup',
  'clean-up',
];

const ROLE_WORDS = [
  'setup',
  'set up',
  'set-up',
  'cleanup',
  'clean up',
  'clean-up',
  'teardown',
  'tear down',
  'registration',
  'check-in',
  'check in',
  'parking',
  'kitchen',
  'serving',
  'servers',
  'greeters',
  'greeter',
  'drivers',
  'runners',
];

const ADULT_RE = /\b(adults? only|adult only|18\+|21\+|no (?:kids|students|minors)|over 18)\b/i;
const STUDENT_RE = /\b(key club|students?|kids|teens?|youth|circle k|builders club)\b/i;
const TODO_RE =
  /\b(bring|order|ask|tell|pick up|pickup|buy|print|remember|call|email|has (?:the )?(?:keys?|code)|from the|reserve|book|confirm|rent)\b/i;
const TIME_RANGE_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|–|—|to|until|til)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/i;
const SINGLE_TIME_RE = /\b(?:at|starts?|from|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
const WEEKDAY_RE =
  /\b(mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b(?:\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?)?/i;
const MONTH_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/;

const STOP_ROLES = /^(the|a|an|it|this|that|them|us|me|need|like|about|more|people|volunteers|hours?|minutes?|lbs?|pounds?|am|pm)$|^(need|like|about|maybe|around)\b/i;

const pad = (n: number) => String(n).padStart(2, '0');

/** Turn an hour written without am/pm into a 24-hour hour using event-day common sense. */
function hour24(h: number, mer: string | undefined, fallbackPm: boolean): number {
  const m = mer?.toLowerCase();
  if (m === 'pm' || m === 'p') return h === 12 ? 12 : h + 12;
  if (m === 'am' || m === 'a') return h === 12 ? 0 : h;
  if (h >= 6 && h <= 11) return h; // 6–11 is morning
  if (h === 12) return 12;
  if (h >= 1 && h <= 5) return h + 12; // 1–5 is afternoon
  return fallbackPm && h < 12 ? h + 12 : h;
}

export function parseTimeRange(s: string): { start: string; end: string } | null {
  const m = TIME_RANGE_RE.exec(s);
  if (!m) return null;
  const [, h1, m1, a1, h2, m2, a2] = m;
  const sh = Number(h1);
  const eh = Number(h2);
  if (sh > 23 || eh > 23 || (m1 && Number(m1) > 59) || (m2 && Number(m2) > 59)) return null;
  let start = hour24(sh, a1 ?? (a2 && sh <= Number(h2) ? a2 : undefined), false);
  let end = hour24(eh, a2, false);
  if (end <= start && !a2) end = Math.min(23, end + 12);
  if (end <= start) return null;
  if (start > 23 || end > 23) return null;
  return { start: `${pad(start)}:${m1 ?? '00'}`, end: `${pad(end)}:${m2 ?? '00'}` };
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function cleanRole(raw: string): string {
  let r = raw
    .replace(/^(the|a|an|do|doing|on|at|for|help(?:ing)? (?:with|on)?)\s+/i, '')
    .replace(/\s+(the|and|or|to|for)$/i, '')
    .replace(/[^\w /&'-]/g, '')
    .trim();
  r = r.replace(/^(the|a|an)\s+/i, '');
  if (!r || STOP_ROLES.test(r)) return '';
  return r.charAt(0).toUpperCase() + r.slice(1, LIMITS.roleChars);
}

function sentences(note: string): string[] {
  return note
    .replace(/\r/g, '')
    .split(/(?<!\b(?:Mr|Ms|Mrs|Mx|Dr|St)\.)(?<=[.!?])\s+|\n+|;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Found extends ParsedShift {
  explicitTime: boolean;
}

function findTitle(note: string): string {
  const lower = note.toLowerCase();
  for (const w of EVENT_WORDS) {
    if (lower.includes(w)) return titleCase(w.replace('clean-up', 'cleanup'));
  }
  const first = sentences(note)[0] ?? 'Volunteer event';
  return first.split(/\s+/).slice(0, 6).join(' ').replace(/[,.;:!?]+$/, '').slice(0, LIMITS.titleChars);
}

function findDate(note: string): string {
  const m = MONTH_RE.exec(note) ?? WEEKDAY_RE.exec(note) ?? NUMERIC_DATE_RE.exec(note);
  return m ? m[0].trim() : '';
}

function findLocation(note: string): string {
  const m = /\b(?:at|@)\s+((?:the\s+)?[A-Za-z][\w'. -]{2,50}?(?:hall|park|church|school|center|centre|library|gym|field|community room|plaza|lot|cafeteria|kitchen|lodge|club|store|market))\b/i.exec(
    note,
  );
  return m ? m[1].replace(/^the\s+/i, '').replace(/\b([a-z])/g, (c) => c.toUpperCase()) : '';
}

function findAdvisor(note: string): string {
  const m = /\b((?:Ms|Mr|Mrs|Mx|Dr)\.?\s+[A-Z][a-zA-Z'-]+)/.exec(note);
  return m ? m[1] : '';
}

/** Extract role + count pairs from one comma-separated segment (with sentence context). */
function shiftsInSentence(sentence: string, mainWindow: { start: string; end: string } | null): Found[] {
  const out: Found[] = [];
  const sentenceTime = parseTimeRange(sentence);
  const adultsOnly = ADULT_RE.test(sentence);
  const segments = sentence.split(/,\s*/);
  let carryRole = '';
  const hasCount = (seg: string) => /\b\d{1,2}\s+(?:more\s+)?(?:people\s+|volunteers\s+)?(?:on|at|for|in|to)\b/i.test(seg);
  // If another segment owns its own time range, don't borrow it: fall back to the main window.
  const timeOwnedElsewhere = segments.some((g) => parseTimeRange(g) && hasCount(g));

  segments.forEach((seg) => {
    const segTime = parseTimeRange(seg);
    // "6 on griddles", "~4 at the cash box", "2 for parking", "need 3 people for setup"
    const countFirst =
      /(?:need\s+)?(?:~|about\s+|around\s+|like\s+|maybe\s+)?(\d{1,2})\s+(?:more\s+)?(?:people\s+|volunteers\s+|folks\s+|adults\s+|kids\s+)?(?:on|at|for|to do|doing|in|working)\s+(?:the\s+)?([a-z][a-z /&'-]{1,40}?)(?=\s+\d|\s*\(|\s+from\b|\s+(?:adults?|need)\b|$)/i.exec(
        seg,
      );
    // "griddle crew: 6", "tables 4"
    const roleFirst = /^([a-z][a-z /&'-]{2,30}?)\s*(?::|x|-)?\s*(\d{1,2})\s*(?:people|volunteers)?$/i.exec(seg.trim());
    // "need like 8" with role from an earlier segment ("kids can do syrup/tables")
    const countOnly = /\bneed(?:s)?\s+(?:~|about\s+|like\s+|around\s+|maybe\s+)?(\d{1,2})\b/i.exec(seg);
    const doRole = /\b(?:can|could|will|to)\s+(?:do|help with|run|work)\s+(?:the\s+)?([a-z][a-z /&'-]{2,30})/i.exec(seg);
    if (doRole) carryRole = doRole[1];

    let role = '';
    let needed = 0;
    if (countFirst) {
      needed = Number(countFirst[1]);
      role = countFirst[2];
    } else if (countOnly && carryRole) {
      needed = Number(countOnly[1]);
      role = carryRole;
    } else if (roleFirst && !TODO_RE.test(seg) && !STOP_ROLES.test(roleFirst[1].trim())) {
      role = roleFirst[1];
      needed = Number(roleFirst[2]);
    } else {
      // Keyword roles mentioned with a time but no count: "Cleanup 10-1", "setup starts 6:30".
      const kw = ROLE_WORDS.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(seg));
      const single = SINGLE_TIME_RE.exec(seg);
      if (kw && (segTime || single)) {
        role = kw;
        needed = 2;
        if (!segTime && single) {
          const h = hour24(Number(single[1]), single[3], false);
          const startStr = `${pad(h)}:${single[2] ?? '00'}`;
          const endStr = mainWindow && mainWindow.start > startStr ? mainWindow.start : `${pad(Math.min(23, h + 1))}:${single[2] ?? '00'}`;
          out.push({ role: cleanRole(role), start: startStr, end: endStr, needed, adultsOnly, explicitTime: true });
          return;
        }
      }
    }
    role = cleanRole(role);
    if (!role || !needed || needed > LIMITS.maxNeeded) return;
    if (/^(hours?|minutes?|lbs?|pounds?|am|pm)$/i.test(role)) return;
    const t = segTime ?? (timeOwnedElsewhere ? null : sentenceTime);
    out.push({
      role,
      start: t?.start ?? mainWindow?.start ?? '09:00',
      end: t?.end ?? mainWindow?.end ?? '12:00',
      needed,
      adultsOnly: adultsOnly && (ADULT_RE.test(seg) || segments.length === 1 || seg === segments[segments.length - 1] || /\(/.test(seg)),
      explicitTime: Boolean(t),
    });
  });
  return out;
}

export function ruleBasedParse(note: string): ParsedEvent {
  const text = note.slice(0, LIMITS.noteChars);
  const all = sentences(text);

  // The most common explicit time range is treated as the main event window.
  const ranges = all.flatMap((s) => s.split(/,\s*/)).map(parseTimeRange).filter(Boolean) as { start: string; end: string }[];
  const freq = new Map<string, number>();
  for (const r of ranges) freq.set(`${r.start}-${r.end}`, (freq.get(`${r.start}-${r.end}`) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const mainWindow = top ? { start: top.split('-')[0], end: top.split('-')[1] } : null;

  const shifts: ParsedShift[] = [];
  const todos: string[] = [];
  const seen = new Set<string>();
  for (const s of all) {
    const found = shiftsInSentence(s, mainWindow);
    for (const f of found) {
      const key = `${f.role.toLowerCase()}|${f.start}|${f.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { explicitTime: _e, ...shift } = f;
      shifts.push(shift);
    }
    // Anything that is not a shift but sounds like a task becomes a to-do.
    for (const seg of s.split(/,\s*(?=[A-Z]|bring|order|ask|tell|need)/)) {
      if (TODO_RE.test(seg) && !/^\s*(?:~|\d)/.test(seg) && todos.length < LIMITS.maxTodos) {
        const t = seg.replace(/[.\s]+$/, '').trim();
        if (t.length > 3 && !shiftsInSentence(seg, mainWindow).length) todos.push(t.slice(0, LIMITS.todoChars));
      }
    }
  }

  if (!shifts.length) {
    shifts.push({ role: 'Volunteer', start: mainWindow?.start ?? '09:00', end: mainWindow?.end ?? '12:00', needed: 4, adultsOnly: false });
  }
  shifts.sort((a, b) => a.start.localeCompare(b.start) || a.role.localeCompare(b.role));

  const lower = text.toLowerCase();
  const contactPreference = /\btext me\b|\btext only\b|\bnot email\b/.test(lower)
    ? 'text'
    : /\bemail me\b|\bnot text\b/.test(lower)
      ? 'email'
      : 'any';

  return ParsedEvent.parse({
    title: findTitle(text),
    date: findDate(text),
    location: findLocation(text),
    shifts: shifts.slice(0, LIMITS.maxShifts),
    todos: [...new Set(todos)],
    advisorName: findAdvisor(text),
    contactPreference,
    studentsWelcome: STUDENT_RE.test(text),
  });
}
