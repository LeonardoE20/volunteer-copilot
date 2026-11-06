import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backend } from '../data';
import type { AiSource } from '../data/backend';
import { LIMITS, type ParsedEvent, type ParsedShift } from '../../shared/schema';
import { parseContactList } from '../../shared/contacts';
import { SAMPLE_ADVISOR_CONTACT, SAMPLE_CONTACTS_TEXT, SAMPLE_NOTE } from '../data/seed';
import { errorText, myEvents, rememberEvent, useTitle } from '../lib/util';

const blankShift = (): ParsedShift => ({ role: '', start: '09:00', end: '12:00', needed: 2, adultsOnly: false });

export function CreatePage() {
  const nav = useNavigate();
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<ParsedEvent | null>(null);
  const [source, setSource] = useState<AiSource | null>(null);
  const [advisorContact, setAdvisorContact] = useState('');
  const [contactsText, setContactsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = myEvents();
  useTitle('Create an event');

  const contacts = parseContactList(contactsText);

  async function makeRoster() {
    setError('');
    setBusy(true);
    try {
      const r = await backend.parseNote(note);
      setDraft(r.event);
      setSource(r.source);
      setTimeout(() => document.getElementById('draft-heading')?.focus(), 0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function useSample() {
    setNote(SAMPLE_NOTE);
    setAdvisorContact(SAMPLE_ADVISOR_CONTACT);
    setContactsText(SAMPLE_CONTACTS_TEXT);
  }

  const update = (patch: Partial<ParsedEvent>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateShift = (i: number, patch: Partial<ParsedShift>) =>
    setDraft((d) => (d ? { ...d, shifts: d.shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d));

  async function publish() {
    if (!draft) return;
    setError('');
    const bad = draft.shifts.find((s) => !s.role.trim() || s.end <= s.start || s.needed < 1);
    if (bad) {
      setError('Every slot needs a name, at least 1 person, and an end time after its start time.');
      setTimeout(() => document.getElementById('create-err')?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const { slug, token } = await backend.createEvent({ event: draft, advisorContact, contacts: contacts.contacts });
      rememberEvent({ slug, token, title: draft.title });
      nav(`/c/${slug}?new=1#${token}`);
    } catch (e) {
      setError(errorText(e));
      setTimeout(() => document.getElementById('create-err')?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Turn your event note into a sign-up sheet</h1>
      <p className="muted">
        Paste the note you'd normally send to the group chat. You'll get a draft roster to check, a link volunteers can use
        without making an account, and help filling the gaps.
      </p>

      {mine.length > 0 && (
        <div className="notice">
          <strong>Your events on this device:</strong>{' '}
          {mine.map((m, i) => (
            <span key={m.slug}>
              {i > 0 && ' · '}
              <Link to={`/c/${m.slug}#${m.token}`}>{m.title}</Link>
            </span>
          ))}
        </div>
      )}

      <div className="card stack">
        <div>
          <label htmlFor="note">Event note</label>
          <textarea
            id="note"
            value={note}
            maxLength={LIMITS.noteChars}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sat pancake breakfast at the hall, need 6 on griddles 7-9, 2 at the cash box (adults only)…"
            aria-describedby="note-help"
          />
          <p id="note-help" className="small muted">
            {note.length}/{LIMITS.noteChars} characters. Don't include phone numbers here; add people in the contact list below.
          </p>
        </div>
        <div className="row">
          <button onClick={makeRoster} disabled={busy || note.trim().length < 10}>
            {busy && !draft ? 'Reading your note…' : 'Make roster'}
          </button>
          <button className="secondary" onClick={useSample} type="button">
            Use the sample note
          </button>
        </div>
      </div>

      {error && (
        <div id="create-err" className="alert" role="alert" tabIndex={-1}>
          {error}
        </div>
      )}

      {draft && (
        <section aria-labelledby="draft-heading">
          <h2 id="draft-heading" tabIndex={-1}>
            Check the draft{' '}
            <span className={`badge ${source === 'ai' ? 'info' : ''}`}>
              {source === 'ai' ? 'Read by AI' : 'Read by simple rules (demo)'}
            </span>
          </h2>
          <p className="small muted">Nothing is shared until you publish. Fix anything that looks wrong.</p>

          <div className="card stack">
            <div>
              <label htmlFor="title">Event name</label>
              <input id="title" type="text" value={draft.title} maxLength={LIMITS.titleChars} onChange={(e) => update({ title: e.target.value })} />
            </div>
            <div className="row">
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="date">Date</label>
                <input id="date" type="text" value={draft.date} maxLength={40} onChange={(e) => update({ date: e.target.value })} />
              </div>
              <div style={{ flex: '2 1 260px' }}>
                <label htmlFor="loc">Place</label>
                <input id="loc" type="text" value={draft.location} maxLength={LIMITS.titleChars} onChange={(e) => update({ location: e.target.value })} />
              </div>
            </div>
          </div>

          <h3>Slots</h3>
          <div className="card stack" role="group" aria-label="Slots">
            {draft.shifts.map((s, i) => (
              <fieldset key={i} className="shift-grid" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="sr-only">Slot {i + 1}</legend>
                <div>
                  <label htmlFor={`role-${i}`}>Role</label>
                  <input id={`role-${i}`} type="text" value={s.role} maxLength={LIMITS.roleChars} onChange={(e) => updateShift(i, { role: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`start-${i}`}>Start</label>
                  <input id={`start-${i}`} type="time" value={s.start} onChange={(e) => updateShift(i, { start: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`end-${i}`}>End</label>
                  <input id={`end-${i}`} type="time" value={s.end} onChange={(e) => updateShift(i, { end: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`need-${i}`}>People</label>
                  <input
                    id={`need-${i}`}
                    type="number"
                    min={1}
                    max={LIMITS.maxNeeded}
                    value={s.needed}
                    onChange={(e) => updateShift(i, { needed: Math.max(1, Math.min(LIMITS.maxNeeded, Number(e.target.value) || 1)) })}
                  />
                </div>
                <label className="check" htmlFor={`adult-${i}`}>
                  <input id={`adult-${i}`} type="checkbox" checked={s.adultsOnly} onChange={(e) => updateShift(i, { adultsOnly: e.target.checked })} />
                  Adults only
                </label>
                <button
                  className="danger"
                  type="button"
                  aria-label={`Remove slot ${s.role || i + 1}`}
                  onClick={() => update({ shifts: draft.shifts.filter((_, j) => j !== i) })}
                  disabled={draft.shifts.length === 1}
                >
                  ✕
                </button>
              </fieldset>
            ))}
            <div>
              <button className="secondary" type="button" onClick={() => update({ shifts: [...draft.shifts, blankShift()] })} disabled={draft.shifts.length >= LIMITS.maxShifts}>
                Add a slot
              </button>
            </div>
          </div>

          {draft.todos.length > 0 && (
            <>
              <h3>To-dos found in your note</h3>
              <ul className="card">
                {draft.todos.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          <h3>Students and advisor</h3>
          <div className="card stack">
            <p className="small muted">
              Our understanding of Kiwanis youth-protection guidance is that adults should not message students one-to-one.
              So every message to students is a group message that includes the advisor. We will confirm this with the club.
            </p>
            <div className="row">
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor="adv">Advisor name</label>
                <input id="adv" type="text" value={draft.advisorName} maxLength={LIMITS.nameChars} onChange={(e) => update({ advisorName: e.target.value })} />
              </div>
              <div style={{ flex: '1 1 260px' }}>
                <label htmlFor="advc">Advisor phone or email</label>
                <input id="advc" type="text" value={advisorContact} maxLength={LIMITS.contactChars} onChange={(e) => setAdvisorContact(e.target.value)} autoComplete="off" />
              </div>
            </div>
          </div>

          <h3>Club contact list (optional)</h3>
          <div className="card stack">
            <label htmlFor="contacts">People you can ask, one per line: name, phone or email, adult or student, roles they've done</label>
            <textarea
              id="contacts"
              value={contactsText}
              onChange={(e) => setContactsText(e.target.value)}
              placeholder={'Dave Sample, (408) 555-0101, adult, Setup; Griddle\nMaya, (408) 555-0107, student, Tables'}
              aria-describedby="contacts-help"
            />
            <p id="contacts-help" className="small muted" aria-live="polite">
              {contacts.contacts.length} people read.
              {contacts.errors.length > 0 && ` ${contacts.errors.length} line(s) skipped: ` + contacts.errors.map((e) => `line ${e.line} (${e.reason})`).join(', ')}
            </p>
          </div>

          {error && (
            <p className="alert" aria-hidden="true">
              {error}
            </p>
          )}
          <div className="row">
            <button onClick={publish} disabled={busy}>
              {busy ? 'Publishing…' : 'Publish sign-up link'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
