/**
 * Central allowlist of routes requiring an authenticated owner passkey session.
 * The password-first login route is deliberately public and finishes with a
 * WebAuthn assertion; every other admin namespace route is owner-only.
 */
export function adminProtectedApiPath(pathname: string): boolean {
  if (pathname === "/api/admin/login/password") return false;
  return pathname === "/api/mailboxes"
    || pathname.startsWith("/api/mailboxes/")
    || pathname === "/api/auth/sessions"
    || pathname.startsWith("/api/auth/sessions/")
    || pathname === "/api/admin"
    || pathname.startsWith("/api/admin/");
}
