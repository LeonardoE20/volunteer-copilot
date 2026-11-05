// Small HTTP helpers shared by the functions.

const MAX_BODY_BYTES = 32 * 1024;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const fail = (status: number, error: string) => json(status, { error });

/** Read a JSON body with a size limit. Returns null on any problem. */
export async function readJson(req: Request): Promise<unknown | null> {
  if (req.method !== 'POST') return null;
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) return null;
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Best-effort client IP from Netlify headers (used only as a rate-limit key, never stored raw). */
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
