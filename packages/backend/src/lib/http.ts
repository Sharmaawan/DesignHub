// Never forward an upstream provider's 401/403 as our own response status — the
// frontend's axios interceptor treats any 401/403 from our API as "your session
// expired" and force-logs the user out. A failed AI provider key or a failed social
// platform auth call is a different kind of failure and must not trigger that.
export function remapUpstreamStatus(status: number): number {
  return status === 401 || status === 403 ? 502 : status;
}
