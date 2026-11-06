import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, HelpCircle, Sparkles, X } from 'lucide-react';
import type { KivoScene } from './kivo-scene';
import './kivo.css';

export type GuideView = 'events' | 'volunteers' | 'messages';
export type GuideAudience = 'unanswered' | 'standby' | 'confirmed';

export interface KivoGuideProps {
  eventTitle: string;
  unfilled: number;
  awaitingReply: number;
  standby: number;
  view: GuideView;
  onNavigate: (view: GuideView) => void;
  onCompose: (audience: GuideAudience) => void;
  helpRequest?: number;
  rosterAvailable?: boolean;
}

type GuideTopic = 'welcome' | 'help' | 'start' | 'draft' | 'statuses' | 'reminders' | 'backup' | 'quiet';
type SceneAction = 'greet' | 'focus' | 'reset';

function readPreference(key: string) {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}

function savePreference(key: string, value: boolean) {
  try { localStorage.setItem(key, String(value)); } catch { /* Guidance also works without storage. */ }
}

export default function KivoGuide({ eventTitle, unfilled, awaitingReply, standby, view, onNavigate, onCompose, helpRequest = 0, rosterAvailable = true }: KivoGuideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KivoScene | null>(null);
  const nextSceneAction = useRef<SceneAction>('reset');
  const [sceneReady, setSceneReady] = useState(false);
  const [graphicsUnavailable, setGraphicsUnavailable] = useState(false);
  const [quiet, setQuiet] = useState(() => readPreference('volunteer-copilot:kivo:quiet'));
  const [reduce, setReduce] = useState(() => readPreference('volunteer-copilot:kivo:reduce'));
  const [systemReduced, setSystemReduced] = useState(false);
  const reducedRef = useRef(reduce);
  const [topic, setTopic] = useState<GuideTopic>('welcome');
  const hintedEvents = useRef(new Set<string>());

  const animate = useCallback((action: SceneAction) => {
    nextSceneAction.current = action;
    sceneRef.current?.[action]();
  }, []);

  const askForHelp = useCallback(() => {
    setTopic('help');
    animate('focus');
  }, [animate]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => { reducedRef.current = reduce || systemReduced; }, [reduce, systemReduced]);

  useEffect(() => {
    let cancelled = false;
    let ownedScene: KivoScene | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      ownedScene?.dispose();
      sceneRef.current = null;
      setSceneReady(false);
      setGraphicsUnavailable(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    void import('./kivo-scene').then(({ createKivoScene }) => {
      if (cancelled) return;
      ownedScene = createKivoScene(canvas, { reducedMotion: () => reducedRef.current });
      sceneRef.current = ownedScene;
      setSceneReady(true);
      if (nextSceneAction.current !== 'reset') ownedScene[nextSceneAction.current]();
    }).catch(() => {
      if (!cancelled) setGraphicsUnavailable(true);
    });
    return () => {
      cancelled = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      ownedScene?.dispose();
      if (sceneRef.current === ownedScene) sceneRef.current = null;
    };
  }, []);

  useEffect(() => { if (helpRequest > 0) askForHelp(); }, [helpRequest, askForHelp]);

  useEffect(() => {
    if (!rosterAvailable || quiet || view !== 'volunteers' || unfilled <= 0 || hintedEvents.current.has(eventTitle)) return;
    hintedEvents.current.add(eventTitle);
    setTopic('backup');
    animate('greet');
  }, [quiet, view, unfilled, eventTitle, animate, rosterAvailable]);

  const guidance: Record<GuideTopic, { title: string; body: string }> = {
    welcome: { title: 'Hi, I’m Kivo.', body: 'A little help with the next step. I can walk you through invitations, roles, and getting everyone ready.' },
    help: { title: 'Let’s find your next step.', body: rosterAvailable ? `${awaitingReply} unanswered invitation${awaitingReply === 1 ? '' : 's'}, ${standby} standby volunteer${standby === 1 ? '' : 's'}. What would you like a hand with?` : 'You can plan events, set role capacities, and view contacts. Volunteer responses and messaging are not connected yet.' },
    start: { title: rosterAvailable ? 'Start with a friendly invitation.' : 'Start with your event and roles.', body: rosterAvailable ? 'Check the event, recipients, and wording. A YES reply expresses interest; the form gathers the details for your coordinator to review.' : 'Choose an event to review its dates and roles. Use New event to plan another, or Volunteers to see your contact directory.' },
    draft: { title: 'You’re in control.', body: 'Review who will receive this and edit the wording. Saving a draft keeps it for review. Sending or scheduling is a separate action.' },
    statuses: { title: 'Each status means something.', body: 'Invited: awaiting a reply. Interested: said YES. Details submitted: completed the form. Confirmed: an agreed role and shift. Standby is this event’s backup pool.' },
    reminders: { title: 'Useful details, useful timing.', body: 'Send policies early, uniform details ahead of the event, and parking information before people travel. Review the timing before scheduling.' },
    backup: { title: 'A few places still need people.', body: `${unfilled} places are not confirmed for ${eventTitle}. ${standby > 0 ? 'You can invite available standby volunteers to help fill them.' : 'You can invite more volunteers and review their availability.'}` },
    quiet: { title: 'Here when you need me.', body: 'Keep going. Press the question mark whenever you want a hand.' },
  };

  function startWalkthrough() {
    onNavigate('events');
    setTopic('start');
    animate('focus');
  }

  function openInvitation(audience: GuideAudience) {
    onCompose(audience);
    setTopic('draft');
    animate('focus');
  }

  function dismiss() { setTopic('quiet'); animate('reset'); }

  return (
    <aside className="kivo-guide" aria-label="Kivo volunteer guide" data-reduced={reduce || systemReduced}>
      <div className="kivo-heading">
        <div><span className="kivo-eyebrow">YOUR VOLUNTEER GUIDE</span><h2>Kivo<span aria-hidden="true">.</span></h2></div>
        <span className="kivo-sparkle" aria-hidden="true"><Sparkles size={17} /></span>
      </div>
      <div className="kivo-stage">
        <canvas className="kivo-canvas" ref={canvasRef} aria-hidden="true" />
        {!sceneReady && <div className="kivo-fallback" role="img" aria-label="Kivo, a friendly volunteer guide">
          <div className="kivo-fallback-head"><div className="kivo-fallback-visor"><span /><span /></div></div>
          <div className="kivo-fallback-body" />
        </div>}
        <div className="kivo-stage-label">A little help. A big difference.</div>
      </div>
      <div className="kivo-speech" aria-live="polite" aria-atomic="true">
        <div className="kivo-speech-heading"><h3>{guidance[topic].title}</h3>{topic !== 'welcome' && topic !== 'quiet' && <button type="button" className="kivo-dismiss" onClick={dismiss} aria-label="Dismiss Kivo tip"><X size={15} /></button>}</div>
        <p>{guidance[topic].body}</p>
        <div className="kivo-actions">
          {(topic === 'welcome' || topic === 'quiet' || topic === 'statuses') && <button type="button" onClick={startWalkthrough}>Show my next step <ArrowUpRight size={13} /></button>}
          {topic === 'help' && <><button type="button" onClick={startWalkthrough}>Guide me <ArrowUpRight size={13} /></button><button type="button" onClick={() => setTopic('statuses')}>Explain statuses</button><button type="button" onClick={() => { onNavigate('messages'); setTopic('reminders'); }}>Reminders</button></>}
          {topic === 'start' && (rosterAvailable ? <button type="button" onClick={() => openInvitation('unanswered')}>Review invitation <ArrowUpRight size={13} /></button> : <button type="button" onClick={() => onNavigate('volunteers')}>View directory <ArrowUpRight size={13} /></button>)}
          {topic === 'backup' && <button type="button" onClick={() => openInvitation(standby > 0 ? 'standby' : 'unanswered')}>{standby > 0 ? 'Review standby outreach' : 'Review invitations'} <ArrowUpRight size={13} /></button>}
          {(topic === 'draft' || topic === 'reminders') && <button type="button" onClick={dismiss}>Got it, Kivo</button>}
        </div>
      </div>
      <div className="kivo-controls">
        <div className="kivo-control-buttons"><button type="button" onClick={() => { animate('greet'); setTopic('welcome'); }}>Meet Kivo <ArrowUpRight size={13} /></button><button type="button" onClick={askForHelp} aria-label="Ask Kivo for guidance"><HelpCircle size={16} /> Help</button></div>
        <label><input type="checkbox" checked={quiet} onChange={event => { setQuiet(event.target.checked); savePreference('volunteer-copilot:kivo:quiet', event.target.checked); }} /> Help only when I ask</label>
        <label><input type="checkbox" checked={reduce} onChange={event => { reducedRef.current = event.target.checked || systemReduced; setReduce(event.target.checked); savePreference('volunteer-copilot:kivo:reduce', event.target.checked); animate('reset'); }} /> Reduce motion</label>
        {graphicsUnavailable && <p className="kivo-graphics-note">Guidance is available with the still illustration on this device.</p>}
      </div>
    </aside>
  );
}
