import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backend } from '../data';
import type { AiSource } from '../data/backend';
import type { Draft, OutreachKind, Roster, Signup, SignupStatus } from '../../shared/schema';
import { LIMITS } from '../../shared/schema';
import { filledFor, formatTime, gaps, shiftLabel, totals } from '../../shared/roster';
import { isYouthSafe, sendLinks } from '../../shared/outreach';
import { parseContactList } from '../../shared/contacts';
import { copyText, errorText, hoursBetween, usePolling, useTitle } from '../lib/util';

const DEMO_PEOPLE = [
  ['Pat Example', '(408) 555-0121', false],
  ['Jordan Sample', 'jordan@example.org', false],
  ['Riley (student)', '(408) 555-0123', true],
  ['Casey Demo', '(408) 555-0124', false],
  ['Avery (student)', '(408) 555-0125', true],
  ['Morgan Fictional', 'morgan@example.org', false],
  ['Quinn (student)', '(408) 555-0127', true],
  ['Drew Placeholder', '(408) 555-0128', false],
] as const;

const STATUS_LABEL: Record<SignupStatus, string> = {
  confirmed: 'Signed up',
  dropped: 'Dropped out',
  no_show: 'No-show',
  attended: 'Attended',
};

export function CoordinatorPage() {
  const { slug = '' } = useParams();
  const token = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  const isNew = new URLSearchParams(location.search).get('new') === '1';
  const [roster, setRoster] = useState<Roster | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftSource, setDraftSource] = useState<AiSource | null>(null);
  const [draftFor, setDraftFor] = useState<{ shiftId: string; kind: OutreachKind } | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [announce, setAnnounce] = useState('');
  const [busy, setBusy] = useState(false);

  const signupUrl = `${location.origin}/e/${slug}`;

  const load = useCallback(() => {
    backend
      .getRoster(slug, token)
      .then((r) => {
        setRoster(r);
        setError('');
      })
      .catch((e) => setError(errorText(e)));
  }, [slug, token]);
  useEffect(load, [load]);
  usePolling(load, 5000);
  useTitle(roster ? `Roster: ${roster.event.title}` : 'Roster');

  async function draft(shiftId: string, kind: OutreachKind) {
    setBusy(true);
    try {
      const r = await backend.draftOutreach(slug, token, shiftId, kind, signupUrl);
      setDrafts(r.drafts);
      setDraftSource(r.source);
      setDraftFor({ shiftId, kind });
      setSent(new Set());
      setAnnounce(r.drafts.length ? `${r.drafts.length} message drafts ready.` : 'No one left to ask for this slot.');
      setTimeout(() => document.getElementById('drafts-h')?.focus(), 0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: Signup, status: SignupStatus) {
    try {
      await backend.setStatus(slug, token, s.id, status);
      const r = await backend.getRoster(slug, token);
      setRoster(r);
      if (status === 'dropped' || status === 'no_show') {
        setAnnounce(`${s.name} marked ${STATUS_LABEL[status].toLowerCase()}. Drafting backfill messages.`);
        await draft(s.shiftId, 'backfill');
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function simulate() {
    if (!roster) return;
    const open = roster.event.shifts.filter((s) => filledFor(s.id, roster.signups) < s.needed);
    if (!open.length) return setAnnounce('Every slot is full.');
    const used = new Set(roster.signups.map((s) => s.contact));
    const person = DEMO_PEOPLE.find((p) => !used.has(p[1]));
    if (!person) return setAnnounce('All demo volunteers are already signed up.');
    const shift = open.find((s) => !(s.adultsOnly && person[2])) ?? open[0];
    try {
      await backend.signUp(slug, { shiftId: shift.id, name: person[0], contact: person[1], isStudent: person[2] && !shift.adultsOnly });
      setAnnounce(`${person[0]} signed up for ${shift.role}.`);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (!roster) {
    return error ? (
      <>
        <h1>Can't open this roster</h1>
        <div className="alert" role="alert">
          {error}
        </div>
        <p>Use the private coordinator link you got when you published the event.</p>
      </>
    ) : (
      <p>Loading…</p>
    );
  }

  const { event, signups } = roster;
  const t = totals(event, signups);
  const openGaps = gaps(event, signups);
  const pct = t.needed ? Math.round((t.filled / t.needed) * 100) : 0;
  const coordUrl = `${location.origin}/c/${slug}#${token}`;

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <h1>{event.title}</h1>
      <p className="muted">{[event.date, event.location].filter(Boolean).join(' · ')}</p>

      {isNew && (
        <div className="notice">
          <strong>Published.</strong> Bookmark this page: it's your private coordinator link. Anyone with it can manage this
          event, so don't share it. Share the sign-up link below instead.
        </div>
      )}

      <div className="card stack">
        <div className="row spread">
          <strong>
            {t.filled} of {t.needed} spots filled
          </strong>
          <span className={`badge ${t.open ? 'gap' : 'ok'}`}>{t.open ? `${t.open} open` : 'All filled'}</span>
        </div>
        <div className="meter" role="img" aria-label={`${pct} percent filled`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div>
          <label htmlFor="share">Sign-up link to share</label>
          <div className="row">
            <input id="share" type="text" readOnly value={signupUrl} style={{ flex: '1 1 240px' }} onFocus={(e) => e.target.select()} />
            <button className="secondary" onClick={async () => setAnnounce((await copyText(signupUrl)) ? 'Link copied.' : 'Copy failed; select the link and copy it.')}>
              Copy
            </button>
            <Link className="btn secondary" to={`/e/${slug}`} target="_blank" rel="noopener">
              Open
            </Link>
          </div>
        </div>
        {backend.mode === 'local' && (
          <div className="row">
            <button className="secondary" onClick={simulate}>
              Simulate a volunteer signing up
            </button>
            <span className="small muted">Demo only: stands in for a second phone.</span>
          </div>
        )}
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <h2>Gaps</h2>
      {openGaps.length === 0 ? (
        <p className="success">Every slot is filled.</p>
      ) : (
        openGaps.map((g) => (
          <div key={g.shift.id} className="card gap row spread">
            <div>
              <strong>{shiftLabel(g.shift)}</strong>
              <div className="small">
                <span className="badge gap">Needs {g.missing}</span> {g.filled} of {g.shift.needed} filled
                {g.shift.adultsOnly && ' · Adults only'}
              </div>
            </div>
            <button onClick={() => draft(g.shift.id, 'nudge')} disabled={busy} aria-label={`Fill this gap: ${shiftLabel(g.shift)}`}>
              Fill this gap
            </button>
          </div>
        ))
      )}

      {draftFor && (
        <section aria-labelledby="drafts-h">
          <h2 id="drafts-h" tabIndex={-1}>
            {draftFor.kind === 'backfill' ? 'Backfill messages' : 'Messages to fill the gap'} for{' '}
            {(() => {
              const s = event.shifts.find((x) => x.id === draftFor.shiftId);
              return s ? shiftLabel(s) : 'this slot';
            })()}{' '}
            <span className={`badge ${draftSource === 'ai' ? 'info' : ''}`}>{draftSource === 'ai' ? 'Written by AI' : 'Template (demo)'}</span>
          </h2>
          <p className="small muted">
            Nothing is sent automatically. Read each message, edit it if you like, then send it from your own phone or email.
          </p>
          {drafts.length === 0 && <p>No one left on your contact list to ask for this slot. Add more people below.</p>}
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              sent={sent.has(d.id)}
              onChange={(text) => setDrafts((all) => all.map((x) => (x.id === d.id ? { ...x, text } : x)))}
              onSent={() => setSent((s) => new Set(s).add(d.id))}
              onAnnounce={setAnnounce}
            />
          ))}
        </section>
      )}

      <h2>All slots</h2>
      {event.shifts.map((s) => {
        const list = signups.filter((x) => x.shiftId === s.id);
        const filled = filledFor(s.id, signups);
        return (
          <div key={s.id} className={`card ${filled >= s.needed ? 'full' : 'gap'}`}>
            <div className="row spread">
              <h3>{shiftLabel(s)}</h3>
              <span className={`badge ${filled >= s.needed ? 'ok' : 'gap'}`}>
                {filled} of {s.needed}
                {filled >= s.needed ? ' · full' : ' · open'}
              </span>
            </div>
            {s.adultsOnly && <p className="small muted">Adults only</p>}
            {list.length === 0 ? (
              <p className="small muted">No one yet.</p>
            ) : (
              <ul className="plain">
                {list.map((x) => (
                  <li key={x.id} className="row spread">
                    <div>
                      <strong style={x.status === 'dropped' || x.status === 'no_show' ? { textDecoration: 'line-through' } : undefined}>{x.name}</strong>{' '}
                      {x.isStudent && <span className="badge info">Student</span>}{' '}
                      <span className={`badge ${x.status === 'confirmed' || x.status === 'attended' ? 'ok' : 'gap'}`}>{STATUS_LABEL[x.status]}</span>
                      <div className="small muted mono">{x.contact}</div>
                    </div>
                    <div className="row" role="group" aria-label={`Actions for ${x.name}`}>
                      {x.status === 'confirmed' ? (
                        <>
                          <button className="secondary" onClick={() => setStatus(x, 'attended')}>
                            Attended
                          </button>
                          <button className="danger" onClick={() => setStatus(x, 'dropped')}>
                            Dropped out
                          </button>
                          <button className="danger" onClick={() => setStatus(x, 'no_show')}>
                            No-show
                          </button>
                        </>
                      ) : (
                        <button className="secondary" onClick={() => setStatus(x, 'confirmed')}>
                          Undo
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {event.todos.length > 0 && (
        <>
          <h2>To-dos from your note</h2>
          <ul className="card">
            {event.todos.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </>
      )}

      <AdvisorSection roster={roster} slug={slug} token={token} onSaved={load} />
      <ContactsSection roster={roster} slug={slug} token={token} onSaved={load} />
      <HoursSection roster={roster} />

      <details className="card">
        <summary>Your private coordinator link</summary>
        <p className="small">Keep this secret. Anyone with it can see contact details and manage the event.</p>
        <code>{coordUrl}</code>
      </details>
    </>
  );
}

function DraftCard(props: { draft: Draft; sent: boolean; onChange: (t: string) => void; onSent: () => void; onAnnounce: (s: string) => void }) {
  const { draft: d } = props;
  const safe = isYouthSafe(d);
  const links = sendLinks(d);
  const students = d.recipients.some((r) => r.isStudent);
  return (
    <div className={`card ${d.blocked ? 'gap' : ''}`}>
      <div className="row spread">
        <div>
          <strong>To: </strong>
          {d.recipients.map((r) => `${r.name}${r.isAdvisor ? ' (advisor)' : ''}`).join(', ')}
        </div>
        {students && safe && <span className="badge ok">Youth-safe: group with advisor</span>}
        {props.sent && <span className="badge ok">Marked sent</span>}
      </div>
      <p className="small muted">{d.reason}</p>
      {d.blocked ? (
        <p className="alert">{d.blocked}</p>
      ) : (
        <>
          <label htmlFor={`d-${d.id}`} className="sr-only">
            Message text
          </label>
          <textarea id={`d-${d.id}`} value={d.text} maxLength={LIMITS.messageChars + 100} onChange={(e) => props.onChange(e.target.value)} style={{ minHeight: 150 }} />
          <p className="small muted">{d.recipients.map((r) => r.contact).join(' · ')}</p>
          <div className="row">
            <button
              className="secondary"
              onClick={async () => props.onAnnounce((await copyText(d.text)) ? 'Message copied.' : 'Copy failed; select the text and copy it.')}
            >
              Copy text
            </button>
            {links.sms && (
              <a className="btn secondary" href={links.sms}>
                Open in Messages
              </a>
            )}
            {links.email && (
              <a className="btn secondary" href={links.email}>
                Open in email
              </a>
            )}
            <button className="secondary" onClick={props.onSent} disabled={props.sent}>
              Mark as sent
            </button>
          </div>
          {students && !links.sms && !links.email && (
            <p className="small muted">
              The students and advisor use different kinds of contact (phone and email), so start one group chat or email that
              includes everyone listed, then paste the text.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AdvisorSection({ roster, slug, token, onSaved }: { roster: Roster; slug: string; token: string; onSaved: () => void }) {
  const [name, setName] = useState(roster.event.advisorName);
  const [contact, setContact] = useState(roster.event.advisorContact);
  const [msg, setMsg] = useState('');
  return (
    <>
      <h2>Advisor</h2>
      <div className="card stack">
        <p className="small muted">Students are only ever messaged in a group that includes the advisor.</p>
        <div className="row">
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="adv-n">Advisor name</label>
            <input id="adv-n" type="text" value={name} maxLength={LIMITS.nameChars} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label htmlFor="adv-c">Advisor phone or email</label>
            <input id="adv-c" type="text" value={contact} maxLength={LIMITS.contactChars} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <button
            className="secondary"
            onClick={async () => {
              try {
                await backend.setAdvisor(slug, token, name, contact);
                setMsg('Saved.');
                onSaved();
              } catch (e) {
                setMsg(errorText(e));
              }
            }}
          >
            Save advisor
          </button>
          <span className="small" aria-live="polite">
            {msg}
          </span>
        </div>
      </div>
    </>
  );
}

function ContactsSection({ roster, slug, token, onSaved }: { roster: Roster; slug: string; token: string; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const parsed = parseContactList(text);
  return (
    <>
      <h2>Club contact list ({roster.contacts.length})</h2>
      <details className="card">
        <summary>Add people to ask</summary>
        <label htmlFor="more">One per line: name, phone or email, adult or student, roles they've done</label>
        <textarea id="more" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <button
            className="secondary"
            disabled={!parsed.contacts.length}
            onClick={async () => {
              try {
                await backend.addContacts(slug, token, parsed.contacts);
                setText('');
                setMsg(`Added ${parsed.contacts.length}.`);
                onSaved();
              } catch (e) {
                setMsg(errorText(e));
              }
            }}
          >
            Add {parsed.contacts.length || ''} people
          </button>
          <span className="small" aria-live="polite">
            {msg}
            {parsed.errors.length > 0 && ` ${parsed.errors.length} line(s) can't be read.`}
          </span>
        </div>
      </details>
    </>
  );
}

function HoursSection({ roster }: { roster: Roster }) {
  const rows = roster.signups
    .filter((s) => s.isStudent && s.status === 'attended')
    .map((s) => {
      const shift = roster.event.shifts.find((x) => x.id === s.shiftId);
      return { s, shift, hours: shift ? hoursBetween(shift.start, shift.end) : 0 };
    });
  return (
    <>
      <h2>Student service hours</h2>
      <div className="card">
        {rows.length === 0 ? (
          <p className="small muted">Mark students as "Attended" and their hours appear here for the advisor to check and sign.</p>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <caption className="sr-only">Student service hours</caption>
              <thead>
                <tr>
                  <th scope="col" align="left">Student</th>
                  <th scope="col" align="left">Role</th>
                  <th scope="col" align="left">Time</th>
                  <th scope="col" align="right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, shift, hours }) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{shift?.role}</td>
                    <td>{shift && `${formatTime(shift.start)}–${formatTime(shift.end)}`}</td>
                    <td align="right">{hours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small">
              {roster.event.title}, {roster.event.date}. Advisor: {roster.event.advisorName || '(not set)'}. Signature: ____________
            </p>
            <button className="secondary" onClick={() => window.print()}>
              Print for the advisor
            </button>
          </>
        )}
      </div>
    </>
  );
}
