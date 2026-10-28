// v3.32 mailbox passwords: an administrator may choose a new mailbox's first
// password (or leave it empty to have one generated and shown once), and
// someone signed in to a mailbox can change its password with the current
// one. Runs the Worker code on node:sqlite against the real migrations.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { d1, migratedDatabase } from "./test-harness.mjs";

async function run(m) {
  const db = migratedDatabase();
  db.exec("INSERT OR REPLACE INTO domains (domain,status,is_primary) VALUES ('example.org','active',1)");
  const env = { DB: d1(db), MAIL: { head: async () => null } };
  const post = (path, body, headers = {}) => new Request(`https://mail.example.org${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const create = async body => m.createNativeMailbox(post("/api/mailboxes", body), env);
  const login = async (email, password, cookie) => m.deviceLogin(post("/api/device/login", { email, password }, cookie ? { Cookie: cookie } : {}), env);

  // Creating: a chosen password is used and never echoed; none means one is generated and shown once.
  let response = await create({ address: "chosen@example.org", password: "Garden-Path9" });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).password, undefined, "a chosen password is not sent back");
  assert.equal((await login("chosen@example.org", "Garden-Path9")).status, 200, "it signs in with the chosen password");
  response = await create({ address: "generated@example.org" });
  const generated = (await response.json()).password;
  assert.equal(typeof generated, "string");
  assert.ok(generated.length >= 24, "a strong password is generated");
  assert.equal((await login("generated@example.org", generated)).status, 200);
  assert.equal((await create({ address: "empty@example.org", password: "" })).status, 201, "an empty password means generate one");
  for (const [password, why] of [["ab", "too short"], ["x".repeat(33), "too long"], [" padded ", "spaces at the ends"], ["aaaa", "repetitive"], [42, "not text"]]) {
    assert.equal((await create({ address: `bad${why.length}@example.org`, password })).status, 400, `refused: ${why}`);
  }

  // Changing your own password.
  const signIn = await login("chosen@example.org", "Garden-Path9");
  const cookie = signIn.headers.get("Set-Cookie").split(";")[0];
  const other = (await login("chosen@example.org", "Garden-Path9")).headers.get("Set-Cookie").split(";")[0];
  const chosenId = db.prepare("SELECT id FROM native_mailboxes WHERE email_address='chosen@example.org'").get().id;
  const generatedId = db.prepare("SELECT id FROM native_mailboxes WHERE email_address='generated@example.org'").get().id;
  const change = async (body, withCookie = cookie) => m.changeOwnMailboxPassword(post("/api/account/password", body, withCookie ? { Cookie: withCookie } : {}), env);
  const devices = () => db.prepare("SELECT COUNT(*) AS n FROM device_session_accounts WHERE account_id=?").get(chosenId).n;
  assert.equal(devices(), 3, "three sign-ins so far, each its own device");

  assert.equal((await change({ accountId: chosenId, currentPassword: "wrong", newPassword: "River-Stone4" })).status, 400, "the current password is required");
  assert.equal((await change({ accountId: chosenId, currentPassword: "Garden-Path9", newPassword: "ab" })).status, 400, "the password rules apply");
  assert.equal((await change({ accountId: chosenId, currentPassword: "Garden-Path9", newPassword: "Garden-Path9" })).status, 400, "it must change");
  assert.equal((await change({ accountId: generatedId, currentPassword: generated, newPassword: "River-Stone4" })).status, 403, "only a mailbox signed in on this device");
  assert.equal((await change({ accountId: "native:admin", currentPassword: "x", newPassword: "River-Stone4" })).status, 400, "admin@ uses the administrator password");
  assert.equal((await change({ accountId: "gmail:someone", currentPassword: "x", newPassword: "River-Stone4" })).status, 400);
  assert.equal((await change({ accountId: chosenId, currentPassword: "Garden-Path9", newPassword: "River-Stone4" }, null)).status, 403, "no session, no change");

  response = await change({ accountId: chosenId, currentPassword: "Garden-Path9", newPassword: "River-Stone4" });
  assert.equal(response.status, 200);
  assert.equal(devices(), 1, "every other device is signed out of the mailbox; this one stays");
  assert.equal((await m.deviceAccountIds(post("/", {}, { Cookie: cookie }), env)).includes(chosenId), true);
  assert.equal((await m.deviceAccountIds(post("/", {}, { Cookie: other }), env)).includes(chosenId), false);
  db.exec("DELETE FROM auth_rate_limits");
  assert.equal((await login("chosen@example.org", "Garden-Path9")).status, 401, "the old password stops working");
  assert.equal((await login("chosen@example.org", "River-Stone4")).status, 200, "the new one works");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mailbox_audit WHERE mailbox_id=? AND operation='password_change_self'").get(chosenId).n, 1, "the change is audited");

  // Guessing the current password through this route counts against the mailbox like sign-in does.
  db.exec("DELETE FROM auth_rate_limits");
  const statuses = [];
  for (let i = 0; i < 35; i++) statuses.push((await change({ accountId: chosenId, currentPassword: `guess-${i}`, newPassword: "Another-One5" })).status);
  assert.ok(statuses.includes(429), "repeated wrong current passwords are rate limited");
}

const out = mkdtempSync(join(tmpdir(), "ltm-mailbox-passwords-"));
try {
  const entry = join(out, "entry.ts");
  const src = new URL("../src/worker/", import.meta.url).pathname;
  writeFileSync(entry, `export { deviceLogin, deviceAccountIds, changeOwnMailboxPassword } from "${src}deviceAuth.ts";
export { createNativeMailbox } from "${src}mailboxes.ts";`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "neutral", external: ["node:*", "cloudflare:*"],
    outfile: join(out, "bundle.mjs"), logLevel: "error", mainFields: ["module", "main"], conditions: ["worker", "browser", "import"] });
  await run(await import(pathToFileURL(join(out, "bundle.mjs")).href));
  console.log("PASS: chosen or generated first passwords; users change their own with the current one");
} finally {
  rmSync(out, { recursive: true, force: true });
}
