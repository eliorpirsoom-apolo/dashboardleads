// Client-side fetch helper: JSON in/out, Hebrew error surfaced from the API.
export async function api<T = any>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? {
          body: JSON.stringify(json),
          headers: { "Content-Type": "application/json", ...rest.headers },
        }
      : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `שגיאה (${res.status})`);
  }
  return data as T;
}
