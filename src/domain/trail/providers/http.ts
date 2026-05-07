export interface AuthedRequestInit extends RequestInit {
  query?: Record<string, string | number | boolean | undefined>;
}

export async function authedFetchJson<T = unknown>(
  url: string,
  token: string,
  init: AuthedRequestInit = {},
): Promise<T> {
  const u = new URL(url);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    }
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const { query: _q, ...rest } = init;
  void _q;
  const res = await fetch(u.toString(), { ...rest, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`,
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
