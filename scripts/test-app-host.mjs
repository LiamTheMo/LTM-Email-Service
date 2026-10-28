// v3.33 one public address: once the administrator signs in on the app's own
// domain, the Worker's workers.dev and preview addresses redirect there and
// their API answers 404. Runs the Worker code on node:sqlite against the real
// migrations, plus source checks on the router.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { d1, migratedDatabase } from "./test-harness.mjs";

const DEV = "https://ltm-email-service.owner.workers.dev";
const PREVIEW = "https://1a2b3c4d-ltm-email-service.owner.workers.dev";

async function run(m) {
  const env = { DB: d1(migratedDatabase()) };
  const at = (base, path, method = "GET") => {
    const request = new Request(base + path, { method });
    return m.workersDevResponse(request, env, new URL(request.url));
  };

  // No domain recorded: workers.dev keeps working (an instance used only there).
  assert.equal(await at(DEV, "/"), null);
  assert.equal(await at(DEV, "/api/instance"), null);

  // Only the app's own HTTPS domain is recorded, never workers.dev or local hosts.
  for (const base of [DEV, PREVIEW, "http://localhost:8787", "http://127.0.0.1:8787", "https://203.0.113.9"]) {
    await m.rememberAppHost(env, new URL(base + "/api/admin/status"));
  }
  m.resetAppHostCache();
  assert.equal(await at(DEV, "/"), null, "nothing recorded from workers.dev or local addresses");

  await m.rememberAppHost(env, new URL("https://Mail.Example.org/api/admin/status"));
  m.resetAppHostCache();
  for (const base of [DEV, PREVIEW]) {
    const page = await at(base, "/settings?tab=1");
    assert.equal(page.status, 308);
    assert.equal(page.headers.get("Location"), "https://mail.example.org/settings?tab=1");
    assert.equal((await at(base, "/", "HEAD")).status, 308);
    for (const path of ["/api/instance", "/api/auth/status", "/api/device/status", "/api/admin/status"]) {
      const api = await at(base, path);
      assert.equal(api.status, 404, `${path} is not served on ${base}`);
    }
    assert.equal((await at(base, "/api/device/login", "POST")).status, 404, "no sign-in there");
    assert.equal((await at(base, "/", "POST")).status, 404);
    assert.equal(await at(base, "/api/webhooks/resend", "POST"), null, "signed provider webhooks keep working");
  }
  assert.equal(await at("https://mail.example.org", "/api/instance"), null, "the own domain is served");
  assert.equal(await at("https://other.example.net", "/"), null, "a second own domain is served too");

  // Moving to another domain: the latest one used by the administrator wins.
  await m.rememberAppHost(env, new URL("https://new.example.org/"));
  m.resetAppHostCache();
  assert.equal((await at(DEV, "/")).headers.get("Location"), "https://new.example.org/");
}

const out = mkdtempSync(join(tmpdir(), "ltm-app-host-"));
try {
  const entry = join(out, "entry.ts");
  const src = new URL("../src/worker/", import.meta.url).pathname;
  writeFileSync(entry, `export { rememberAppHost, workersDevResponse, resetAppHostCache } from "${src}appHost.ts";`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "neutral", external: ["node:*", "cloudflare:*"],
    outfile: join(out, "bundle.mjs"), logLevel: "error", mainFields: ["module", "main"], conditions: ["worker", "browser", "import"] });
  await run(await import(pathToFileURL(join(out, "bundle.mjs")).href));
} finally {
  rmSync(out, { recursive: true, force: true });
}

// The router checks the address before anything else and records it only for owner sessions.
const router = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
const fetchHandler = router.slice(router.indexOf("async fetch(request, env, ctx)"));
assert.ok(fetchHandler.indexOf("workersDevResponse(") < fetchHandler.indexOf("routeApi("), "workers.dev is checked before any API route");
assert.match(router, /if \(isAdmin\) ctx\.waitUntil\(rememberAppHost\(/, "only an administrator session records the domain");
assert.match(router, /headers\.set\("X-Robots-Tag", "noindex, nofollow"\)/, "API responses are never indexed");
assert.match(readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8"), /^Disallow: \/$/m);
console.log("PASS: workers.dev and preview addresses stop serving the app once it has its own domain");
