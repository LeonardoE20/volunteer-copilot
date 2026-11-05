// Live backend: every call goes to one Netlify Function (/api/rpc). No keys in the browser.
import type { ContactInput, CreateEventInput, Draft, OutreachKind, ParsedEvent, PublicEvent, Roster, SignupInput, SignupStatus } from '../../shared/schema';
import { BackendError, type AiSource, type Backend } from './backend';

async function rpc<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new BackendError('Could not reach the server. Check your connection.', 'network');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) throw new BackendError(body.error ?? 'Something went wrong.', body.code ?? String(res.status));
  return body;
}

export class RemoteBackend implements Backend {
  readonly mode = 'remote' as const;
  parseNote(note: string) {
    return rpc<{ event: ParsedEvent; source: AiSource }>('parse', { note });
  }
  createEvent(input: CreateEventInput) {
    return rpc<{ slug: string; token: string }>('create', { input });
  }
  async getPublicEvent(slug: string) {
    try {
      return (await rpc<{ event: PublicEvent }>('public', { slug })).event;
    } catch (e) {
      if (e instanceof BackendError && e.code === 'not_found') return null;
      throw e;
    }
  }
  signUp(slug: string, input: SignupInput) {
    return rpc<{ signupId: string; removeToken: string }>('signup', { slug, input });
  }
  async removeSignup(slug: string, signupId: string, removeToken: string) {
    await rpc('remove', { slug, signupId, removeToken });
  }
  async getRoster(slug: string, token: string) {
    return (await rpc<{ roster: Roster }>('roster', { slug, token })).roster;
  }
  async setStatus(slug: string, token: string, signupId: string, status: SignupStatus) {
    await rpc('status', { slug, token, signupId, status });
  }
  async addContacts(slug: string, token: string, contacts: ContactInput[]) {
    await rpc('contacts', { slug, token, contacts });
  }
  async setAdvisor(slug: string, token: string, advisorName: string, advisorContact: string) {
    await rpc('advisor', { slug, token, advisorName, advisorContact });
  }
  draftOutreach(slug: string, token: string, shiftId: string, kind: OutreachKind, signupUrl: string) {
    return rpc<{ drafts: Draft[]; source: AiSource }>('draft', { slug, token, shiftId, kind, signupUrl });
  }
}
