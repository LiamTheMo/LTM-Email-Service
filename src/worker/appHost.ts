import { jsonError } from "./http";

/**
 * v3.33: one public address. Cloudflare also serves every Worker on
 * <name>.<account>.workers.dev and on per-version preview links, which put a
 * second copy of the sign-in page and API on the internet. Once the
 * administrator has signed in on the app's own domain (proof the passkey works
 * there), those addresses stop serving the app: pages redirect to the domain
 * and the API answers 404. An instance only ever used on workers.dev is
 * unaffected, because no domain has been recorded.
 */
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Each isolate re-reads the address after a minute, so a new domain or a
// deleted row (to serve workers.dev again) reaches every isolate quickly.
const CACHE_TTL_MS = 60_000;
let known: { hostname: string | null; at: number } | null = null;

export const isWorkersDevHost = (hostname: string): boolean => /(^|\.)workers\.dev$/i.test(hostname);

const isOwnDomain = (url: URL): boolean =>
  url.protocol === "https:" && !isWorkersDevHost(url.hostname) && !LOCAL.has(url.hostname) && !/^[\d.]+$/.test(url.hostname);

async function appHost(env: Env): Promise<string | null> {
  if (known && Date.now() - known.at < CACHE_TTL_MS) return known.hostname;
  const row = await env.DB.prepare("SELECT hostname FROM app_host WHERE id = 1").first<{ hostname: string }>().catch(() => null);
  known = { hostname: row?.hostname ?? null, at: Date.now() };
  return known.hostname;
}

/** Records the domain an administrator session is used on (call for owner sessions only). */
export async function rememberAppHost(env: Env, url: URL): Promise<void> {
  if (!isOwnDomain(url)) return;
  const hostname = url.hostname.toLowerCase();
  if ((await appHost(env)) === hostname) return;
  await env.DB.prepare(`INSERT INTO app_host (id, hostname) VALUES (1, ?1)
    ON CONFLICT(id) DO UPDATE SET hostname = excluded.hostname, updated_at = CURRENT_TIMESTAMP`).bind(hostname).run();
  known = { hostname, at: Date.now() };
}

/**
 * The response for a request on a workers.dev address once the app has its own
 * domain, or null to serve the request normally. Provider webhooks are
 * signature-checked server-to-server calls and keep working wherever they point.
 */
export async function workersDevResponse(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (!isWorkersDevHost(url.hostname) || url.pathname === "/api/webhooks/resend") return null;
  const hostname = await appHost(env);
  if (!hostname) return null;
  if (url.pathname.startsWith("/api/")) return jsonError("Not found", 404);
  if (request.method === "GET" || request.method === "HEAD") {
    return new Response(null, { status: 308, headers: { Location: `https://${hostname}${url.pathname}${url.search}`, "Cache-Control": "no-store" } });
  }
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** Test hook: forget the cached address. */
export function resetAppHostCache(): void {
  known = null;
}
