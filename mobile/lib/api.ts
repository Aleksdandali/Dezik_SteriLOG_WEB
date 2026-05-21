import { API_BASE_URL } from './config';
import { getToken, clearToken } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

type RequestOpts = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

/**
 * Wrapper around `fetch` that:
 *   - prepends API_BASE_URL
 *   - adds `Authorization: Bearer <token>` if we have one
 *   - JSON-encodes body
 *   - throws ApiError on non-2xx
 *   - clears token on 401 (caller can navigate to /login)
 *
 * NB: backend currently expects `x-telegram-init-data` instead of Authorization.
 * See README → "Backend gaps". We send both headers so a future backend change
 * can switch over without touching this client.
 */
export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-telegram-init-data'] = token; // legacy header path — see README
  }

  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers,
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }

  if (!res.ok) {
    if (res.status === 401) await clearToken();
    const msg =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string')
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, body);
  }

  return body as T;
}
