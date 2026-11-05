// The advisor's private page: confirm students' service hours with one tap. No account.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { backend } from '../data';
import { LIMITS, type AdvisorHours } from '../../shared/schema';
import { formatTime } from '../../shared/roster';
import { errorText, useTitle } from '../lib/util';

export function AdvisorPage() {
  const { slug = '' } = useParams();
  const token = location.hash.slice(1);
  const [data, setData] = useState<AdvisorHours | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [signedName, setSignedName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle('Confirm service hours');

  const load = useCallback(() => {
    backend
      .getAdvisorHours(slug, token)
      .then((d) => {
        setData(d);
        setSignedName((n) => n || d.advisorName);
        setPicked(new Set(d.rows.filter((r) => !r.confirmed).map((r) => r.signupId)));
      })
      .catch((e) => setError(errorText(e)));
  }, [slug, token]);
  useEffect(load, [load]);

  if (error && !data)
    return (
      <>
        <h1>Can't open this page</h1>
        <div className="alert" role="alert">
          {error}
        </div>
      </>
    );
  if (!data) return <p>Loading…</p>;

  const open = data.rows.filter((r) => !r.confirmed);

  async function confirm() {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await backend.confirmHours(slug, token, [...picked], signedName);
      setMsg(`Confirmed ${picked.size} student${picked.size === 1 ? '' : 's'}. Thank you!`);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Confirm service hours</h1>
      <p className="muted">
        {data.title}
        {data.date && `, ${data.date}`}. These students were marked as attended by the event coordinator.
      </p>
      {data.rows.length === 0 ? (
        <p>No students have been marked as attended yet.</p>
      ) : (
        <div className="card stack">
          <ul className="plain" aria-label="Students">
            {data.rows.map((r) => (
              <li key={r.signupId} className="row spread">
                {r.confirmed ? (
                  <div>
                    <strong>{r.name}</strong> · {r.role}, {formatTime(r.start)}–{formatTime(r.end)} · {r.hours.toFixed(1)} h
                  </div>
                ) : (
                  <label className="check" htmlFor={`c-${r.signupId}`} style={{ fontWeight: 500 }}>
                    <input
                      id={`c-${r.signupId}`}
                      type="checkbox"
                      checked={picked.has(r.signupId)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(r.signupId);
                          else n.delete(r.signupId);
                          return n;
                        })
                      }
                    />
                    <span>
                      <strong>{r.name}</strong> · {r.role}, {formatTime(r.start)}–{formatTime(r.end)} · {r.hours.toFixed(1)} h
                    </span>
                  </label>
                )}
                {r.confirmed && <span className="badge ok">Confirmed by {r.confirmed.by}</span>}
              </li>
            ))}
          </ul>
          {open.length > 0 && (
            <>
              <div>
                <label htmlFor="sig">Type your name to sign</label>
                <input id="sig" type="text" value={signedName} maxLength={LIMITS.nameChars} onChange={(e) => setSignedName(e.target.value)} autoComplete="name" />
              </div>
              <button onClick={confirm} disabled={busy || picked.size === 0 || signedName.trim().length < 2}>
                {busy ? 'Saving…' : `Confirm ${picked.size} student${picked.size === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <p role="status" className={msg ? 'success' : 'sr-only'}>
        {msg}
      </p>
      <p className="small muted">This page shows names and hours only. It does not show any contact details.</p>
    </>
  );
}
