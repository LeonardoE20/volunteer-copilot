// One interface, two implementations: LocalBackend (demo mode, browser storage, mock AI)
// and RemoteBackend (Netlify Functions + Supabase + Claude). Screens only talk to this.
import type {
  ContactInput,
  CreateEventInput,
  ParsedEvent,
  PublicEvent,
  Roster,
  SignupInput,
  SignupStatus,
  Draft,
  OutreachKind,
  AdvisorHours,
} from '../../shared/schema';

export type AiSource = 'ai' | 'mock';

export interface Backend {
  readonly mode: 'local' | 'remote';
  parseNote(note: string): Promise<{ event: ParsedEvent; source: AiSource }>;
  createEvent(input: CreateEventInput): Promise<{ slug: string; token: string }>;
  getPublicEvent(slug: string): Promise<PublicEvent | null>;
  signUp(slug: string, input: SignupInput): Promise<{ signupId: string; removeToken: string }>;
  removeSignup(slug: string, signupId: string, removeToken: string): Promise<void>;
  getRoster(slug: string, token: string): Promise<Roster>;
  setStatus(slug: string, token: string, signupId: string, status: SignupStatus): Promise<void>;
  addContacts(slug: string, token: string, contacts: ContactInput[]): Promise<void>;
  setAdvisor(slug: string, token: string, advisorName: string, advisorContact: string): Promise<void>;
  /** Make (or replace) the advisor's private link for confirming student hours. */
  createAdvisorLink(slug: string, token: string): Promise<{ advisorToken: string }>;
  getAdvisorHours(slug: string, advisorToken: string): Promise<AdvisorHours>;
  confirmHours(slug: string, advisorToken: string, signupIds: string[], signedName: string): Promise<void>;
  draftOutreach(
    slug: string,
    token: string,
    shiftId: string,
    kind: OutreachKind,
    signupUrl: string,
  ): Promise<{ drafts: Draft[]; source: AiSource }>;
}

export class BackendError extends Error {
  constructor(
    message: string,
    public code: string = 'error',
  ) {
    super(message);
  }
}
