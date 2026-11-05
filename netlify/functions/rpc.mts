// The single server endpoint (/api/rpc). Every database read and write goes through here,
// using the service-role key, after validation, token checks and rate limits.
// Not used in demo mode. Switch on by setting the env vars in .env.example and VITE_BACKEND=remote.
import { z } from 'zod';
import {
  AdvisorInput,
  ContactInput,
  CreateEventInput,
  NoteInput,
  SignupInput,
  firstError,
  type Contact,
  type EventRecord,
  type Roster,
  type Signup,
} from '../../shared/schema';
import { newSlug, newToken, safeEqual, sha256Hex } from '../../shared/ids';
import { toPublic } from '../../shared/roster';
import { ruleBasedParse } from '../../shared/parser';
import { planOutreach, withTemplateText } from '../../shared/outreach';
import { PARSE_SYSTEM, WRITE_SYSTEM, mergeWritten, parseUserPrompt, validateParsed, writeUserPrompt } from '../../shared/prompts';
import { callClaude, extractJson } from './_lib/claude';
import { allow, allowAi, db } from './_lib/db';
import { clientIp, fail, json, readJson } from './_lib/http';

const Slug = z.string().regex(/^[a-z0-9]{6,16}$/);
const Token = z.string().regex(/^[a-z0-9]{20,64}$/);
const Id = z.string().uuid();

type Row = Record<string, unknown>;

async function loadEvent(slug: string) {
  const d = db()!;
  const { data: ev } = await d.from('events').select('*').eq('slug', slug).maybeSingle();
  if (!ev) return null;
  const [{ data: shifts }, { data: signups }] = await Promise.all([
    d.from('shifts').select('*').eq('event_id', ev.id).order('position'),
    d.from('signups').select('id, shift_id, name, contact, is_student, status, created_at').eq('event_id', ev.id),
  ]);
  const event: EventRecord = {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    date: ev.event_date,
    location: ev.location,
    todos: Array.isArray(ev.todos) ? ev.todos : [],
    advisorName: ev.advisor_name,
    advisorContact: ev.advisor_contact,
    contactPreference: ev.contact_preference,
    studentsWelcome: ev.students_welcome,
    createdAt: ev.created_at,
    shifts: (shifts ?? []).map((s: Row) => ({
      id: s.id as string,
      role: s.role as string,
      start: s.start_time as string,
      end: s.end_time as string,
      needed: s.needed as number,
      adultsOnly: s.adults_only as boolean,
    })),
  };
  const list: Signup[] = (signups ?? []).map((s: Row) => ({
    id: s.id as string,
    shiftId: s.shift_id as string,
    name: s.name as string,
    contact: s.contact as string,
    isStudent: s.is_student as boolean,
    status: s.status as Signup['status'],
    createdAt: s.created_at as string,
  }));
  return { event, signups: list, tokenHash: ev.coordinator_token_hash as string };
}

async function authed(slug: unknown, token: unknown) {
  const s = Slug.safeParse(slug);
  const t = Token.safeParse(token);
  if (!s.success || !t.success) return null;
  const loaded = await loadEvent(s.data);
  if (!loaded) return null;
  if (!safeEqual(await sha256Hex(t.data), loaded.tokenHash)) return null;
  return loaded;
}

async function loadRoster(loaded: NonNullable<Awaited<ReturnType<typeof loadEvent>>>): Promise<Roster> {
  const { data } = await db()!.from('contacts').select('*').eq('event_id', loaded.event.id);
  const contacts: Contact[] = (data ?? []).map((c: Row) => ({
    id: c.id as string,
    name: c.name as string,
    contact: c.contact as string,
    isStudent: c.is_student as boolean,
    pastRoles: Array.isArray(c.past_roles) ? (c.past_roles as string[]) : [],
  }));
  return { event: loaded.event, signups: loaded.signups, contacts };
}

export default async (req: Request) => {
  if (req.method !== 'POST') return fail(405, 'Use POST');
  const body = (await readJson(req)) as Row | null;
  if (!body || typeof body.action !== 'string') return fail(400, 'Bad request');
  const ip = clientIp(req);
  const origin = new URL(req.url).origin;

  if (!(await allow(`all:${ip}`, 300, 600))) return fail(429, 'Too many requests. Please wait a few minutes.');

  // Parsing works even without a database (it only needs AI, or falls back to rules).
  if (body.action === 'parse') {
    const n = NoteInput.safeParse({ note: body.note });
    if (!n.success) return fail(400, firstError(n.error));
    if (await allowAi(ip)) {
      const reply = await callClaude({ purpose: 'parse', system: PARSE_SYSTEM, user: parseUserPrompt(n.data.note), maxTokens: 1500 });
      const parsed = reply ? validateParsed(extractJson(reply)) : null;
      if (parsed) return json(200, { event: parsed, source: 'ai' });
    }
    return json(200, { event: ruleBasedParse(n.data.note), source: 'mock' });
  }

  const d = db();
  if (!d) return fail(503, 'The database is not configured. Run in demo mode instead.');

  switch (body.action) {
    case 'create': {
      if (!(await allow(`create:${ip}`, 10, 3600))) return fail(429, 'Too many new events from here. Try later.');
      const p = CreateEventInput.safeParse(body.input);
      if (!p.success) return fail(400, firstError(p.error));
      const { event: e, advisorContact, contacts } = p.data;
      const token = newToken();
      const { data: ev, error } = await d
        .from('events')
        .insert({
          slug: newSlug(),
          coordinator_token_hash: await sha256Hex(token),
          title: e.title,
          event_date: e.date,
          location: e.location,
          todos: e.todos,
          advisor_name: e.advisorName,
          advisor_contact: advisorContact,
          contact_preference: e.contactPreference,
          students_welcome: e.studentsWelcome,
        })
        .select('id, slug')
        .single();
      if (error || !ev) return fail(500, 'Could not create the event.');
      await d.from('shifts').insert(
        e.shifts.map((s, i) => ({
          event_id: ev.id,
          role: s.role,
          start_time: s.start,
          end_time: s.end,
          needed: s.needed,
          adults_only: s.adultsOnly,
          position: i,
        })),
      );
      if (contacts.length) {
        await d.from('contacts').insert(
          contacts.map((c) => ({ event_id: ev.id, name: c.name, contact: c.contact, is_student: c.isStudent, past_roles: c.pastRoles })),
        );
      }
      return json(200, { slug: ev.slug, token });
    }

    case 'public': {
      const s = Slug.safeParse(body.slug);
      if (!s.success) return fail(404, 'Event not found');
      const loaded = await loadEvent(s.data);
      if (!loaded) return json(404, { error: 'Event not found', code: 'not_found' });
      return json(200, { event: toPublic(loaded.event, loaded.signups) });
    }

    case 'signup': {
      const s = Slug.safeParse(body.slug);
      const input = SignupInput.safeParse(body.input);
      if (!s.success) return fail(404, 'Event not found');
      if (!input.success) return fail(400, firstError(input.error));
      if (!(await allow(`signup:${ip}`, 20, 3600)) || !(await allow(`signup:event:${s.data}`, 500, 86400))) {
        return fail(429, 'Too many sign-ups. Please try again later.');
      }
      const loaded = await loadEvent(s.data);
      if (!loaded) return fail(404, 'Event not found');
      if (!Id.safeParse(input.data.shiftId).success) return fail(400, 'That slot no longer exists.');
      const removeToken = newToken();
      const { data: id, error } = await d.rpc('claim_slot', {
        p_event_id: loaded.event.id,
        p_shift_id: input.data.shiftId,
        p_name: input.data.name,
        p_contact: input.data.contact,
        p_is_student: input.data.isStudent,
        p_remove_hash: await sha256Hex(removeToken),
      });
      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('shift_full')) return json(409, { error: 'Sorry, that slot just filled up. Please pick another one.', code: 'shift_full' });
        if (msg.includes('adults_only')) return json(409, { error: 'This slot is for adults only. Please pick another one.', code: 'adults_only' });
        return fail(400, 'Could not sign up for that slot.');
      }
      return json(200, { signupId: id, removeToken });
    }

    case 'remove': {
      const s = Slug.safeParse(body.slug);
      const id = Id.safeParse(body.signupId);
      const t = Token.safeParse(body.removeToken);
      if (!s.success || !id.success || !t.success) return fail(403, 'This link is not valid.');
      const { data: row } = await d.from('signups').select('id, remove_token_hash, events!inner(slug)').eq('id', id.data).maybeSingle();
      const rowSlug = (row as { events?: { slug?: string } } | null)?.events?.slug;
      if (!row || rowSlug !== s.data || !safeEqual(await sha256Hex(t.data), row.remove_token_hash as string)) {
        return fail(403, 'This link is not valid.');
      }
      await d.from('signups').delete().eq('id', id.data);
      return json(200, { ok: true });
    }

    case 'roster': {
      const loaded = await authed(body.slug, body.token);
      if (!loaded) return fail(403, 'This coordinator link is not valid.');
      return json(200, { roster: await loadRoster(loaded) });
    }

    case 'status': {
      const loaded = await authed(body.slug, body.token);
      if (!loaded) return fail(403, 'This coordinator link is not valid.');
      const id = Id.safeParse(body.signupId);
      const st = z.enum(['confirmed', 'dropped', 'no_show', 'attended']).safeParse(body.status);
      if (!id.success || !st.success) return fail(400, 'Bad request');
      await d.from('signups').update({ status: st.data }).eq('id', id.data).eq('event_id', loaded.event.id);
      return json(200, { ok: true });
    }

    case 'contacts': {
      const loaded = await authed(body.slug, body.token);
      if (!loaded) return fail(403, 'This coordinator link is not valid.');
      const list = z.array(ContactInput).max(300).safeParse(body.contacts);
      if (!list.success) return fail(400, firstError(list.error));
      if (list.data.length) {
        await d.from('contacts').insert(
          list.data.map((c) => ({ event_id: loaded.event.id, name: c.name, contact: c.contact, is_student: c.isStudent, past_roles: c.pastRoles })),
        );
      }
      return json(200, { ok: true });
    }

    case 'advisor': {
      const loaded = await authed(body.slug, body.token);
      if (!loaded) return fail(403, 'This coordinator link is not valid.');
      const a = AdvisorInput.safeParse({ advisorName: body.advisorName, advisorContact: body.advisorContact });
      if (!a.success) return fail(400, firstError(a.error));
      await d.from('events').update({ advisor_name: a.data.advisorName, advisor_contact: a.data.advisorContact }).eq('id', loaded.event.id);
      return json(200, { ok: true });
    }

    case 'draft': {
      const loaded = await authed(body.slug, body.token);
      if (!loaded) return fail(403, 'This coordinator link is not valid.');
      const kind = z.enum(['nudge', 'backfill']).safeParse(body.kind);
      if (!kind.success || typeof body.shiftId !== 'string') return fail(400, 'Bad request');
      const roster = await loadRoster(loaded);
      // The sign-up link is built here, never taken from the request.
      const plans = planOutreach(roster, body.shiftId, kind.data, `${origin}/e/${loaded.event.slug}`);
      if (!plans.length) return json(200, { drafts: [], source: 'mock' });
      if (await allowAi(ip)) {
        const reply = await callClaude({ purpose: 'write', system: WRITE_SYSTEM, user: writeUserPrompt(plans), maxTokens: 1200 });
        if (reply) {
          const merged = mergeWritten(plans, extractJson(reply));
          return json(200, { drafts: merged.drafts, source: merged.usedAi ? 'ai' : 'mock' });
        }
      }
      return json(200, { drafts: withTemplateText(plans), source: 'mock' });
    }

    default:
      return fail(400, 'Unknown action');
  }
};
