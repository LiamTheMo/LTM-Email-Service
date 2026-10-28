import { useState, type FormEvent } from "react";
import type { ConnectedAccount } from "../mailTypes";
import { ADMIN_ACCOUNT_ID } from "../appModel";

/**
 * Settings → Password: change the password of a custom-domain mailbox signed in
 * on this device. The current password is required; other devices using the
 * mailbox are signed out, this one stays signed in. admin@ uses the
 * administrator password (admin panel); Gmail passwords belong to Google.
 */
export function ChangePassword({ accounts, preferredAccountId }: { accounts: ConnectedAccount[]; preferredAccountId: string | null }) {
  const mailboxes = accounts.filter(account => account.provider === "native" && account.status === "active" && account.id !== ADMIN_ACCOUNT_ID);
  const [accountId, setAccountId] = useState(() =>
    mailboxes.find(account => account.id === preferredAccountId)?.id ?? mailboxes[0]?.id ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  if (!mailboxes.length) return null;
  const selected = mailboxes.some(account => account.id === accountId) ? accountId : mailboxes[0].id;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (next !== confirm) {
      setNotice({ ok: false, text: "The new passwords do not match" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selected, currentPassword: current, newPassword: next }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not change the password");
      setCurrent(""); setNext(""); setConfirm(""); setShow(false);
      setNotice({ ok: true, text: "Password changed. Other devices signed in to this mailbox were signed out." });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "Could not change the password" });
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <section className="settings-section" aria-label="Password">
      <h3>Password</h3>
      <p>Change the password you sign in with. Other devices using the mailbox are signed out; this one stays signed in.</p>
      <form className="settings-password-form" onSubmit={event => void submit(event)}>
        {/* Lets password managers save the new password for the right mailbox. */}
        <input type="text" name="username" autoComplete="username" value={mailboxes.find(account => account.id === selected)?.emailAddress ?? ""} readOnly hidden />
        {mailboxes.length > 1 ? (
          <label>
            Mailbox
            <select value={selected} disabled={busy} onChange={event => { setNotice(null); setAccountId(event.target.value); }}>
              {mailboxes.map(account => <option key={account.id} value={account.id}>{account.emailAddress}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Current password
          <input type={type} autoComplete="current-password" value={current} maxLength={128} required
            onChange={event => setCurrent(event.target.value)} />
        </label>
        <label>
          New password
          <input type={type} autoComplete="new-password" value={next} minLength={4} maxLength={32} required
            onChange={event => setNext(event.target.value)} />
        </label>
        <label>
          Confirm new password
          <input type={type} autoComplete="new-password" value={confirm} minLength={4} maxLength={32} required
            onChange={event => setConfirm(event.target.value)} />
        </label>
        <label className="settings-password-show">
          <input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)} /> Show passwords
        </label>
        <small>4–32 characters, no spaces at the start or end.</small>
        {notice ? <p className={notice.ok ? "settings-password-ok" : "settings-password-error"} role={notice.ok ? "status" : "alert"}>{notice.text}</p> : null}
        <button className="settings-primary" type="submit" disabled={busy || !current || !next || !confirm}>
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}
