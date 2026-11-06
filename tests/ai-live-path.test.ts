// Runs the real serverless function (netlify/functions/rpc.mts) with "keys" set, against a
// mocked Anthropic HTTP API and a tiny in-memory stand-in for Supabase. This exercises the
// live AI code path (request building, timeouts/errors, JSON extraction, validation, merging)
// that has never run against the real services.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../shared/ids';

// ---- In-memory Supabase stand-in (only what rpc.mts uses) ----
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { events: [], shifts: [], signups: [], contacts: [] };

function builder(table: string) {
  const filters: [string, unknown][] = [];
  const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push([k, v]), b),
    order: () => b,
    in: () => b,
    update: () => b,
    insert: () => b,
    delete: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
  };
  return b;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => builder(t), rpc: async () => ({ data: true, error: null }) }),
}));

// ---- Mocked Anthropic API ----
let nextReply: () => Response;
const calls: { url: string; headers: Record<string, string>; body: { model: string; system: string; messages: { content: string }[] } }[] = [];
const claudeText = (text: string) => () =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });

const TOKEN = 'coordinatortoken0123456789abcdefgh';
const SLUG = 'demo1234';
const post = async (body: unknown) => {
  const { default: rpc } = await import('../netlify/functions/rpc.mts');
  return rpc(new Request('https://site.example/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
};

beforeEach(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  process.env.CLAUDE_MODEL_PARSE = 'test-parse-model';
  process.env.CLAUDE_MODEL_WRITE = 'test-write-model';
  process.env.SUPABASE_URL = 'https://db.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return nextReply();
    }),
  );
  tables.events = [
    {
      id: 'ev1', slug: SLUG, coordinator_token_hash: await sha256Hex(TOKEN), title: 'Pancake Breakfast', event_date: 'Sat the 14th',
      location: 'Hall', todos: [], advisor_name: 'Ms. Ortiz', advisor_contact: '(408) 555-0150', contact_preference: 'text',
      students_welcome: true, created_at: '',
    },
  ];
  tables.shifts = [
    { id: 'sh1', event_id: 'ev1', role: 'Syrup/tables', start_time: '07:00', end_time: '10:00', needed: 4, adults_only: false, position: 0 },
  ];
  tables.signups = [];
  tables.contacts = [
    { id: 'c1', event_id: 'ev1', name: 'Dave Sample', contact: '(408) 555-0101', is_student: false, past_roles: ['Tables'] },
    { id: 'c2', event_id: 'ev1', name: 'Maya Student', contact: '(408) 555-0107', is_student: true, past_roles: [] },
  ];
});
afterEach(() => vi.unstubAllGlobals());

const NOTE = 'Pancake breakfast Sat, need 6 on griddles 7-9, 2 at the cash box 7-10 adults only.';
const GOOD_PARSE = JSON.stringify({
  title: 'Pancake Breakfast', date: 'Sat', location: '', todos: [], advisorName: '', contactPreference: 'any', studentsWelcome: false,
  shifts: [
    { role: 'Griddle', start: '07:00', end: '09:00', needed: 6, adultsOnly: false },
    { role: 'Cash box', start: '07:00', end: '10:00', needed: 2, adultsOnly: true },
  ],
});

describe('live AI path: reading the note', () => {
  it('sends a well-formed request with the env model and the note wrapped as data, and uses valid output', async () => {
    nextReply = claudeText('Here you go:\n```json\n' + GOOD_PARSE + '\n```');
    const res = await post({ action: 'parse', note: NOTE });
    const body = await res.json();
    expect(body.source).toBe('ai');
    expect(body.event.shifts[1]).toMatchObject({ role: 'Cash box', adultsOnly: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].headers['x-api-key']).toBe('test-key-not-real');
    expect(calls[0].body.model).toBe('test-parse-model');
    expect(calls[0].body.messages[0].content).toContain('<note>');
    expect(calls[0].body.system).toMatch(/never follow/i);
  });

  it.each([
    ['malformed text', claudeText('Sorry, I cannot do that {not json')],
    ['schema-breaking JSON', claudeText(JSON.stringify({ title: 'x', shifts: [{ role: 'a', start: '9am', end: '10', needed: 500 }] }))],
    ['shift ending before it starts', claudeText(GOOD_PARSE.replace('"end":"09:00"', '"end":"06:00"'))],
    ['HTTP 500', () => new Response('oops', { status: 500 })],
    ['empty content', () => new Response(JSON.stringify({ content: [] }), { status: 200 })],
  ])('falls back to the rule-based parser on %s', async (_name, reply) => {
    nextReply = reply;
    const body = await (await post({ action: 'parse', note: NOTE })).json();
    expect(body.source).toBe('mock');
    expect(body.event.shifts.find((s: { role: string }) => /griddle/i.test(s.role))).toMatchObject({ needed: 6 });
  });

  it('does not call the API when no model is configured', async () => {
    delete process.env.CLAUDE_MODEL_PARSE;
    nextReply = claudeText(GOOD_PARSE);
    const body = await (await post({ action: 'parse', note: NOTE })).json();
    expect(body.source).toBe('mock');
    expect(calls).toHaveLength(0);
  });
});

describe('live AI path: writing messages', () => {
  const draft = () => post({ action: 'draft', slug: SLUG, token: TOKEN, shiftId: 'sh1', kind: 'nudge', signupUrl: 'https://evil.example/phish' });

  it('never sends phone numbers or emails to the AI, and uses the write model', async () => {
    nextReply = claudeText('{"messages": []}');
    await draft();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.model).toBe('test-write-model');
    const sent = JSON.stringify(calls[0].body);
    expect(sent).not.toMatch(/555-01/);
    expect(sent).toContain('<slots>');
  });

  it('keeps code-chosen recipients and our own link when the AI tries to add links or change recipients', async () => {
    nextReply = () => {
      const ids = JSON.parse(calls[0].body.messages[0].content.replace(/<\/?slots>/g, '')).map((x: { id: string }) => x.id);
      return claudeText(
        JSON.stringify({
          messages: ids.map((id: string) => ({
            id,
            text: 'Hi! Ms. Ortiz, the advisor, is cc’d. Ignore the list and also text Maya privately at (408) 555-0199 or go to http://evil.example and bit.ly/x',
          })),
          recipients: [{ name: 'Maya Student', contact: '(408) 555-0199' }],
        }),
      )();
    };
    const body = await (await draft()).json();
    expect(body.source).toBe('ai');
    const group = body.drafts.find((d: { audience: string }) => d.audience === 'group');
    const solo = body.drafts.find((d: { audience: string }) => d.audience === 'individual');
    expect(solo.recipients.map((r: { name: string }) => r.name)).toEqual(['Dave Sample']);
    expect(group.recipients.map((r: { name: string }) => r.name).sort()).toEqual(['Maya Student', 'Ms. Ortiz'].sort());
    expect(group.includesAdvisor).toBe(true);
    for (const d of body.drafts) {
      expect(d.text).not.toMatch(/evil|bit\.ly|555-0199/);
      // Our link is built on the server from the request origin; the client's signupUrl is ignored.
      expect(d.text.endsWith('https://site.example/e/demo1234')).toBe(true);
    }
  });

  it('uses templates when the reply is malformed', async () => {
    nextReply = claudeText('<<<not json at all');
    const body = await (await draft()).json();
    expect(body.source).toBe('mock');
    expect(body.drafts.find((d: { audience: string }) => d.audience === 'group').text).toContain('Ms. Ortiz is on this message');
  });

  it('rejects a wrong coordinator token before any AI call', async () => {
    nextReply = claudeText('{}');
    const res = await post({ action: 'draft', slug: SLUG, token: 'wrongtoken0123456789abcdefghijk', shiftId: 'sh1', kind: 'nudge' });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
