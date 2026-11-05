// Picks the backend. Demo mode (local) is the default and needs no keys at all.
import type { Backend } from './backend';
import { LocalBackend, MemoryStore, type KeyValueStore, type LocalAi } from './local';
import { RemoteBackend } from './remote';
import { mockAi } from './mockAi';

function browserStore(): KeyValueStore {
  try {
    const k = '__vc_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return new MemoryStore();
  }
}

export function makeBackend(ai: LocalAi = mockAi): Backend {
  if (import.meta.env.VITE_BACKEND === 'remote') return new RemoteBackend();
  return new LocalBackend(browserStore(), ai);
}

export const backend: Backend = makeBackend();
