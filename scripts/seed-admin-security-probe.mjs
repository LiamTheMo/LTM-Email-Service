import { execFileSync } from "node:child_process";
import { preparePassword } from "../src/worker/passwordCrypto.ts";

const config = "scripts/admin-security.wrangler.jsonc";
const wrangler = "./node_modules/.bin/wrangler";
const mailboxPassword = "LocalSecurityAudit-Mailbox-2026";
const adminPassword = "LocalSecurityAudit-Admin-2026";

function sqlRun(statement) {
  execFileSync(wrangler,
    ["d1", "execute", "DB", "--local", "--config", config, "--command", statement],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
const mailbox = await preparePassword(mailboxPassword, "mailbox");
const admin = await preparePassword(adminPassword, "admin");
const escaped = value => value.replaceAll("'", "''");
const mailboxSql = "INSERT INTO native_mailbox_credentials(mailbox_id,password_salt,password_hash,iterations) "
  + "VALUES('native:primary','" + escaped(mailbox.salt) + "','" + escaped(mailbox.hash) + "'," + mailbox.iterations + ") "
  + "ON CONFLICT(mailbox_id) DO UPDATE SET "
  + "password_salt=excluded.password_salt,password_hash=excluded.password_hash,iterations=excluded.iterations;";
const adminSql = "INSERT INTO admin_credentials(id,password_salt,password_hash,iterations) "
  + "VALUES(1,'" + escaped(admin.salt) + "','" + escaped(admin.hash) + "'," + admin.iterations + ") "
  + "ON CONFLICT(id) DO UPDATE SET "
  + "password_salt=excluded.password_salt,password_hash=excluded.password_hash,iterations=excluded.iterations;";
sqlRun(mailboxSql);
sqlRun(adminSql);
// Test-only credential ID: it cannot produce a valid passkey assertion.
sqlRun("INSERT OR IGNORE INTO auth_credentials(id,public_key,counter,transports) VALUES('audit-local-passkey',X'000102030405060708090A0B0C0D0E0F',0,'[]');");
console.log("Seeded isolated local-only mailbox and admin identities.");
