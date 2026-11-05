import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backend } from '../data';
import { LIMITS, type PublicEvent } from '../../shared/schema';
import { formatTime } from '../../shared/roster';
import { errorText, rememberSignup, usePolling } from '../lib/util';

export function SignupPage() {
  const { slug = '' } = useParams();
  const [event, setEvent] = useState<PublicEvent | null | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [isStudent, setIsStudent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ role: string; when: string; removeUrl: string } | null>(null);

  const load = useCallback(() => {
    backend
      .getPublicEvent(slug)
      .then(setEvent)
      .catch(() => setEvent((e) => e ?? null));
  }, [slug]);
  useEffect(load, [load]);
  usePolling(load, 10000);

  if (event === undefined) return <p>Loading…</p>;
  if (event === null)
    return (
      <>
        <h1>We couldn't find this event</h1>
        <p>The link may be mistyped, or the event was removed. Ask the person who sent it.</p>
      </>
    );

  const shift = event.shifts.find((s) => s.id === picked);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!shift) return;
    setError('');
    setBusy(true);
    try {
      const r = await backend.signUp(slug, { shiftId: shift.id, name, contact, isStudent, website });
      rememberSignup(slug, r.signupId, r.removeToken);
      setDone({
        role: shift.role,
        when: `${formatTime(shift.start)}–${formatTime(shift.end)}${event!.date ? `, ${event!.date}` : ''}`,
        removeUrl: `${location.origin}/e/${slug}/remove?id=${encodeURIComponent(r.signupId)}#${r.removeToken}`,
      });
      load();
    } catch (err) {
      setError(errorText(err));
      load();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section aria-live="polite">
        <h1>You're signed up. Thank you!</h1>
        <div className="success">
          <strong>{done.role}</strong>, {done.when}
          {event.location && <> at {event.location}</>}
        </div>
        <p>
          Can't make it after all? Use this link to take your name off, so the coordinator can find someone else. Save it
          or screenshot this page:
        </p>
        <p>
          <a href={done.removeUrl}>Remove me from this slot</a>
        </p>
        <button className="secondary" onClick={() => { setDone(null); setPicked(null); }}>
          Sign up for another slot
        </button>
      </section>
    );
  }

  return (
    <>
      <h1>{event.title}</h1>
      <p className="muted">
        {[event.date, event.location].filter(Boolean).join(' · ')}
        {(event.date || event.location) && <br />}
        Pick a slot. No account needed.
      </p>

      <ul className="plain" aria-label="Slots">
        {event.shifts.map((s) => {
          const open = Math.max(0, s.needed - s.filled);
          return (
            <li key={s.id} className="row spread">
              <div>
                <strong>{s.role}</strong>
                <div className="small muted">
                  {formatTime(s.start)}–{formatTime(s.end)} · {open > 0 ? `${open} of ${s.needed} spots open` : 'Full'}
                  {s.adultsOnly && ' · Adults only'}
                </div>
              </div>
              <button
                onClick={() => {
                  setPicked(s.id);
                  setError('');
                  setTimeout(() => document.getElementById('vol-name')?.focus(), 0);
                }}
                disabled={open === 0}
                aria-label={open === 0 ? `${s.role} is full` : `Pick ${s.role}, ${formatTime(s.start)} to ${formatTime(s.end)}`}
                className={picked === s.id ? '' : 'secondary'}
              >
                {open === 0 ? 'Full' : picked === s.id ? 'Picked' : 'Pick'}
              </button>
            </li>
          );
        })}
      </ul>

      {shift && (
        <form className="card stack" onSubmit={submit} aria-labelledby="form-h">
          <h2 id="form-h" style={{ marginTop: 0 }}>
            {shift.role}, {formatTime(shift.start)}–{formatTime(shift.end)}
          </h2>
          <div>
            <label htmlFor="vol-name">Your name</label>
            <input id="vol-name" type="text" required maxLength={LIMITS.nameChars} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="vol-contact">Phone or email</label>
            <input
              id="vol-contact"
              type="text"
              inputMode="email"
              required
              maxLength={LIMITS.contactChars}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              autoComplete="tel"
              aria-describedby="contact-help"
            />
            <p id="contact-help" className="small muted">
              Only the coordinator sees this, to reach you about this event.
            </p>
          </div>
          {event.studentsWelcome && (
            <label className="check" htmlFor="vol-student">
              <input id="vol-student" type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)} />
              I'm a student (for example Key Club) and want service hours
            </label>
          )}
          {shift.adultsOnly && isStudent && (
            <p className="alert" role="alert">
              This slot is for adults only. Please pick another slot.
            </p>
          )}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="website">Leave this empty</label>
            <input id="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" disabled={busy || (shift.adultsOnly && isStudent)}>
              {busy ? 'Saving…' : 'Sign me up'}
            </button>
            <button type="button" className="secondary" onClick={() => setPicked(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function RemovePage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<'ask' | 'done' | 'error'>('ask');
  const [msg, setMsg] = useState('');
  const id = new URLSearchParams(location.search).get('id') ?? '';
  const token = location.hash.slice(1);

  async function remove() {
    try {
      await backend.removeSignup(slug, id, token);
      setState('done');
    } catch (e) {
      setMsg(errorText(e));
      setState('error');
    }
  }

  return (
    <section aria-live="polite">
      <h1>Take your name off this slot?</h1>
      {state === 'ask' && (
        <>
          <p>The coordinator will see the slot is open again and can ask someone else.</p>
          <button className="danger" onClick={remove}>
            Yes, remove me
          </button>
        </>
      )}
      {state === 'done' && (
        <div className="success">
          Done. Your name and contact details were deleted from this slot. Thanks for letting us know. <Link to={`/e/${slug}`}>See other slots</Link>
        </div>
      )}
      {state === 'error' && <div className="alert">{msg}</div>}
    </section>
  );
}
