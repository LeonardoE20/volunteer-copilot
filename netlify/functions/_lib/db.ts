// Server-only Supabase client (service role). Returns null when not configured.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from '../../../shared/ids';

let client: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

/**
 * Fixed-window rate limit. Returns true if allowed. Fails closed for AI calls (costly) and
 * open for everything else when the database is unreachable.
 */
const memory = new Map<string, { w: number; c: number }>();

/** Per-instance fallback when there is no database (weaker: each function instance counts alone). */
function allowInMemory(key: string, limit: number, windowSeconds: number): boolean {
  const w = Math.floor(Date.now() / 1000 / windowSeconds);
  const cur = memory.get(key);
  const next = cur && cur.w === w ? { w, c: cur.c + 1 } : { w, c: 1 };
  memory.set(key, next);
  return next.c <= limit;
}

export async function allow(key: string, limit: number, windowSeconds: number, failClosed = false) {
  const d = db();
  if (!d) return allowInMemory(key, limit, windowSeconds);
  const hashed = (await sha256Hex(key)).slice(0, 32); // do not store raw IPs
  const { data, error } = await d.rpc('hit_rate_limit', {
    p_key: hashed,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return !failClosed;
  return data === true;
}

/** Global daily cap on AI calls. */
export async function allowAi(ip: string): Promise<boolean> {
  const cap = Number(process.env.AI_DAILY_CAP ?? '200') || 200;
  const [perIp, global] = await Promise.all([
    allow(`ai:ip:${ip}`, 20, 3600, true),
    allow('ai:global', cap, 86400, true),
  ]);
  return perIp && global;
}
