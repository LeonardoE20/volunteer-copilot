// Minimal server-side wrapper for the Claude Messages API.
// The API key and model names come only from environment variables. If either is missing,
// callers get `null` and fall back to the rule-based mock, so the app always works.

const API_URL = 'https://api.anthropic.com/v1/messages';

export type ModelPurpose = 'parse' | 'write';

function modelFor(purpose: ModelPurpose): string | undefined {
  const v = purpose === 'parse' ? process.env.CLAUDE_MODEL_PARSE : process.env.CLAUDE_MODEL_WRITE;
  return v && v.trim() ? v.trim() : undefined;
}

export function claudeConfigured(purpose: ModelPurpose): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && modelFor(purpose));
}

export interface ClaudeCall {
  purpose: ModelPurpose;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
}

/** Returns the model's text reply, or null if not configured or the call fails. Never throws. */
export async function callClaude(call: ClaudeCall): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = modelFor(call.purpose);
  if (!key || !model) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), call.timeoutMs ?? 20000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: call.maxTokens,
        system: call.system,
        messages: [{ role: 'user', content: call.user }],
      }),
    });
    if (!res.ok) {
      // Log status only; never log the key or the full request.
      console.error('Claude API error', res.status);
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const textPart = data.content?.find((c) => c.type === 'text')?.text;
    return textPart ?? null;
  } catch (e) {
    console.error('Claude API call failed', (e as Error).name);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
}
