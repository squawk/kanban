/** Small helpers for JSON API responses. */

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function jsonError(error: string, status: number, extra?: Record<string, unknown>): Response {
  return json({ error, ...extra }, status);
}

/** Parse a JSON body, returning {} for empty/invalid bodies. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
