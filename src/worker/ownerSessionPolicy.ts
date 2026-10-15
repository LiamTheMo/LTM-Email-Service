/** Owner passkey sessions deliberately expire sooner than mailbox sessions. */
export const OWNER_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const OWNER_IDLE_TTL_SECONDS = 60 * 60;
export const OWNER_SESSION_COOKIE = "__Host-ltm_session";

/**
 * Tokens are 32 cryptographically random bytes encoded as unpadded base64url.
 * Reject malformed or oversized cookie values before doing any database work.
 * In particular, do not decodeURIComponent attacker-controlled cookie text.
 */
export function readOwnerSessionToken(request: Request): string | null {
  let value: string | null = null;
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const pair = part.trim();
    const index = pair.indexOf("=");
    if (index <= 0 || pair.slice(0, index) !== OWNER_SESSION_COOKIE) continue;
    // Duplicate owner cookies are invalid, even if their values match.
    if (value !== null) return null;
    const candidate = pair.slice(index + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(candidate)) return null;
    value = candidate;
  }
  return value;
}
