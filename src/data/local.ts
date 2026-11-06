// Demo-mode backend: everything lives in this browser's storage. No network, no keys.
// It enforces the same rules as the server (validation, capacity, adults-only, tokens),
// so the demo behaves like the real thing.
import {
  AdvisorInput,
  ConfirmHoursInput,
  type AdvisorHours,
  ContactInput,
  CreateEventInput,
  SignupInput,
  firstError,
  type Contact,
  type Draft,
  type EventRecord,
  type OutreachKind,
  type ParsedEvent,
  type Roster,
  type Signup,
  type SignupStatus,
} from '../../shared/schema';
import { newId, newSlug, newToken, safeEqual, sha256Hex } from '../../shared/ids';
import { filledFor, studentHours, toPublic } from '../../shared/roster';
import { BackendError, type AiSource, type Backend } from './backend';

interface StoredEvent {
  event: EventRecord;
  tokenHash: string;
  advisorTokenHash?: string;
  signups: (Signup & { removeHash: string })[];
  contacts: Contact[];
}
interface DB {
  version: 1;
  events: Record<string, StoredEvent>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Fallback when browser storage is blocked (private mode): data lasts until reload. */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

export interface LocalAi {
  parse(note: string): Promise<ParsedEvent>;
  draft(roster: Roster, shiftId: string, kind: OutreachKind, signupUrl: string): Promise<Draft[]>;
}

const KEY = 'volunteer-copilot:db:v1';

/** Phones by their last 10 digits, emails lower-cased. Same rule as the database. */
export const normContact = (c: string) => {
  const digits = c.replace(/\D/g, '');
  return c.includes('@') ? c.trim().toLowerCase() : digits.slice(-10);
};

export class LocalBackend implements Backend {
  readonly mode = 'local' as const;
  constructor(
    private store: KeyValueStore,
    private ai: LocalAi,
  ) {}

  private load(): DB {
    try {
      const raw = this.store.getItem(KEY);
      if (raw) {
        const db = JSON.parse(raw) as DB;
        if (db && db.version === 1 && db.events) return db;
      }
    } catch {
      /* corrupted or blocked storage: start fresh */
    }
    return { version: 1, events: {} };
  }
  private save(db: DB) {
    try {
      this.store.setItem(KEY, JSON.stringify(db));
    } catch {
      throw new BackendError('Could not save in this browser (storage full or blocked).', 'storage');
    }
  }
  private get(db: DB, slug: string): StoredEvent {
    const e = db.events[slug];
    if (!e) throw new BackendError('Event not found.', 'not_found');
    return e;
  }
  private async auth(e: StoredEvent, token: string) {
    if (!safeEqual(await sha256Hex(token), e.tokenHash)) {
      throw new BackendError('This coordinator link is not valid.', 'forbidden');
    }
  }

  async parseNote(note: string): Promise<{ event: ParsedEvent; source: AiSource }> {
    return { event: await this.ai.parse(note), source: 'mock' };
  }

  async createEvent(raw: CreateEventInput) {
    const parsed = CreateEventInput.safeParse(raw);
    if (!parsed.success) throw new BackendError(firstError(parsed.error), 'invalid');
    const { event: p, advisorContact, contacts } = parsed.data;
    const db = this.load();
    let slug = newSlug();
    while (db.events[slug]) slug = newSlug();
    const token = newToken();
    const event: EventRecord = {
      id: newId(),
      slug,
      title: p.title,
      date: p.date,
      location: p.location,
      todos: p.todos,
      advisorName: p.advisorName,
      advisorContact,
      contactPreference: p.contactPreference,
      studentsWelcome: p.studentsWelcome,
      shifts: p.shifts.map((s) => ({ ...s, id: newId() })),
      createdAt: new Date().toISOString(),
    };
    db.events[slug] = {
      event,
      tokenHash: await sha256Hex(token),
      signups: [],
      contacts: contacts.map((c) => ({ ...c, id: newId() })),
    };
    this.save(db);
    return { slug, token };
  }

  async getPublicEvent(slug: string) {
    const e = this.load().events[slug];
    return e ? toPublic(e.event, e.signups) : null;
  }

  async signUp(slug: string, raw: SignupInput) {
    const parsed = SignupInput.safeParse(raw);
    if (!parsed.success) throw new BackendError(firstError(parsed.error), 'invalid');
    const input = parsed.data;
    const db = this.load();
    const e = this.get(db, slug);
    const shift = e.event.shifts.find((s) => s.id === input.shiftId);
    if (!shift) throw new BackendError('That slot no longer exists.', 'not_found');
    if (input.isStudent && !e.event.studentsWelcome) {
      throw new BackendError('This event is not taking student sign-ups.', 'no_students');
    }
    if (shift.adultsOnly && input.isStudent) {
      throw new BackendError('This slot is for adults only. Please pick another one.', 'adults_only');
    }
    if (filledFor(shift.id, e.signups) >= shift.needed) {
      throw new BackendError('Sorry, that slot just filled up. Please pick another one.', 'shift_full');
    }
    const norm = normContact(input.contact);
    const mine = e.signups.filter((s) => s.status === 'confirmed' && normContact(s.contact) === norm);
    if (mine.some((s) => s.shiftId === shift.id)) throw new BackendError('You are already signed up for this slot.', 'duplicate');
    if (mine.length >= 3) throw new BackendError('You already have 3 slots at this event. Thank you!', 'too_many');
    const removeToken = newToken();
    const signup = {
      id: newId(),
      shiftId: shift.id,
      name: input.name,
      contact: input.contact,
      isStudent: input.isStudent,
      status: 'confirmed' as const,
      createdAt: new Date().toISOString(),
      removeHash: await sha256Hex(removeToken),
    };
    e.signups.push(signup);
    this.save(db);
    return { signupId: signup.id, removeToken };
  }

  async removeSignup(slug: string, signupId: string, removeToken: string) {
    const db = this.load();
    const e = this.get(db, slug);
    const s = e.signups.find((x) => x.id === signupId);
    if (!s || !safeEqual(await sha256Hex(removeToken), s.removeHash)) {
      throw new BackendError('This link is not valid.', 'forbidden');
    }
    e.signups = e.signups.filter((x) => x.id !== signupId);
    this.save(db);
  }

  async getRoster(slug: string, token: string): Promise<Roster> {
    const e = this.get(this.load(), slug);
    await this.auth(e, token);
    return { event: e.event, signups: e.signups.map(({ removeHash: _r, ...s }) => s), contacts: e.contacts };
  }

  async setStatus(slug: string, token: string, signupId: string, status: SignupStatus) {
    const db = this.load();
    const e = this.get(db, slug);
    await this.auth(e, token);
    const s = e.signups.find((x) => x.id === signupId);
    if (!s) throw new BackendError('Signup not found.', 'not_found');
    s.status = status;
    if (status !== 'attended') delete s.hoursConfirmed;
    this.save(db);
  }

  async addContacts(slug: string, token: string, raw: ContactInput[]) {
    const db = this.load();
    const e = this.get(db, slug);
    await this.auth(e, token);
    const valid = raw.map((c) => ContactInput.parse(c));
    const known = new Set(e.contacts.map((c) => c.contact.toLowerCase()));
    for (const c of valid) {
      if (!known.has(c.contact.toLowerCase())) e.contacts.push({ ...c, id: newId() });
    }
    this.save(db);
  }

  async setAdvisor(slug: string, token: string, advisorName: string, advisorContact: string) {
    const parsed = AdvisorInput.safeParse({ advisorName, advisorContact });
    if (!parsed.success) throw new BackendError(firstError(parsed.error), 'invalid');
    const db = this.load();
    const e = this.get(db, slug);
    await this.auth(e, token);
    e.event.advisorName = parsed.data.advisorName;
    e.event.advisorContact = parsed.data.advisorContact;
    this.save(db);
  }

  private async advisorAuth(e: StoredEvent, advisorToken: string) {
    if (!e.advisorTokenHash || !safeEqual(await sha256Hex(advisorToken), e.advisorTokenHash)) {
      throw new BackendError('This advisor link is not valid. Ask the coordinator for a new one.', 'forbidden');
    }
  }

  async createAdvisorLink(slug: string, token: string) {
    const db = this.load();
    const e = this.get(db, slug);
    await this.auth(e, token);
    const advisorToken = newToken();
    e.advisorTokenHash = await sha256Hex(advisorToken); // replaces any older link
    this.save(db);
    return { advisorToken };
  }

  async getAdvisorHours(slug: string, advisorToken: string): Promise<AdvisorHours> {
    const e = this.get(this.load(), slug);
    await this.advisorAuth(e, advisorToken);
    return { title: e.event.title, date: e.event.date, advisorName: e.event.advisorName, rows: studentHours(e.event, e.signups) };
  }

  async confirmHours(slug: string, advisorToken: string, signupIds: string[], signedName: string) {
    const parsed = ConfirmHoursInput.safeParse({ signupIds, signedName });
    if (!parsed.success) throw new BackendError(firstError(parsed.error), 'invalid');
    const db = this.load();
    const e = this.get(db, slug);
    await this.advisorAuth(e, advisorToken);
    const allowed = new Set(studentHours(e.event, e.signups).map((r) => r.signupId));
    const at = new Date().toISOString();
    for (const id of parsed.data.signupIds) {
      if (!allowed.has(id)) throw new BackendError('Only attended students can be confirmed.', 'invalid');
    }
    for (const s of e.signups) {
      if (parsed.data.signupIds.includes(s.id)) s.hoursConfirmed = { by: parsed.data.signedName, at };
    }
    this.save(db);
  }

  async draftOutreach(slug: string, token: string, shiftId: string, kind: OutreachKind, signupUrl: string) {
    const roster = await this.getRoster(slug, token);
    return { drafts: await this.ai.draft(roster, shiftId, kind, signupUrl), source: 'mock' as const };
  }
}
