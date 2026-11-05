import { useEffect, useRef } from 'react';
import { BackendError } from '../data/backend';

/** Coordinator links this browser has created, so the coordinator can find them again. */
const MINE = 'volunteer-copilot:mine:v1';
export interface MyEvent {
  slug: string;
  token: string;
  title: string;
}
export function rememberEvent(e: MyEvent) {
  try {
    const list = myEvents().filter((x) => x.slug !== e.slug);
    localStorage.setItem(MINE, JSON.stringify([e, ...list].slice(0, 10)));
  } catch {
    /* storage blocked: the coordinator link still works */
  }
}
export function myEvents(): MyEvent[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.slug === 'string' && typeof x.token === 'string') : [];
  } catch {
    return [];
  }
}

/** Volunteer's own "remove me" token, kept so the confirmation screen survives a reload. */
export function rememberSignup(slug: string, signupId: string, removeToken: string) {
  try {
    localStorage.setItem(`volunteer-copilot:signup:${slug}`, JSON.stringify({ signupId, removeToken }));
  } catch {
    /* ignore */
  }
}

export function errorText(e: unknown): string {
  if (e instanceof BackendError) return e.message;
  return 'Something went wrong. Please try again.';
}

/** Set the browser tab title for this screen. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} – Volunteer Copilot` : 'Volunteer Copilot';
  }, [title]);
}

/** Run `fn` every `ms` while the tab is visible. */
export function usePolling(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    const id = window.setInterval(tick, ms);
    window.addEventListener('storage', tick); // instant update across tabs in demo mode
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', tick);
    };
  }, [ms]);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const hoursBetween = (start: string, end: string) => Math.max(0, (minutes(end) - minutes(start)) / 60);
