// Random IDs and secret tokens. Uses Web Crypto, available in browsers and Node 18+.

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alike characters

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const newId = () => randomString(12);
/** Short, readable slug for the public sign-up link. */
export const newSlug = () => randomString(8);
/** Secret token (about 160 bits) for the coordinator link and "remove me" links. */
export const newToken = () => randomString(32);

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison for hashes. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
