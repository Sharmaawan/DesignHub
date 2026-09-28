// Every platform adapter's outbound call to a third-party API (Meta, LinkedIn,
// Twitter/X, Pinterest) used plain `fetch()` with no timeout at all — if that
// platform's API (or the network path to it) is slow or unreachable, the request
// just hangs indefinitely. The frontend's own axios client eventually gives up
// after 30s with a generic "timeout of 30000ms exceeded" (surfaced to the user
// with no indication of what actually failed), while the backend request may
// still be stuck waiting well after that. This wraps `fetch` with an
// AbortController so a stuck call fails fast, server-side, with a clear message
// naming the platform — turning a silent hang into an actionable error.
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw Object.assign(new Error(`Request timed out after ${timeoutMs / 1000}s — the platform's API may be slow or unreachable`), { status: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
