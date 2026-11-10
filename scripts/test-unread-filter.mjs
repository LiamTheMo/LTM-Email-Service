// The Unread / Starred tabs never drop the message that is open in the reader:
// opening marks it read, which used to remove its row the instant it opened.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyListFilter } from "../src/client/mailListFilter.ts";

const msg = (id, extra = {}) => ({ id, threadId: `t-${id}`, accountId: "native:a", direction: "inbound", fromAddress: "a@b.c",
  fromName: null, toAddresses: [], subject: id, preview: "", receivedAt: 1, sentAt: null, isRead: false, isStarred: false,
  isArchived: false, isDeleted: false, isJunk: false, hasAttachments: false, deliveryStatus: null, ...extra });
const ids = (list) => list.map(m => m.id);

const list = [msg("a"), msg("b"), msg("c", { isRead: true })];
// Plain behaviour is unchanged: All shows everything, Unread only unread mail.
assert.deepEqual(ids(applyListFilter(list, list, "all", null)), ["a", "b", "c"]);
assert.deepEqual(ids(applyListFilter(list, list, "unread", null)), ["a", "b"]);

// Opening "a" marks it read; it must stay listed while it is open.
const afterOpen = [msg("a", { isRead: true }), msg("b"), msg("c", { isRead: true })];
assert.deepEqual(ids(applyListFilter(afterOpen, afterOpen, "unread", "a")), ["a", "b"]);
// Once the reader closes (Back, delete, ...) it leaves the Unread list.
assert.deepEqual(ids(applyListFilter(afterOpen, afterOpen, "unread", null)), ["b"]);
// Opening another message releases the first one.
const afterSecond = [msg("a", { isRead: true }), msg("b", { isRead: true }), msg("c", { isRead: true })];
assert.deepEqual(ids(applyListFilter(afterSecond, afterSecond, "unread", "b")), ["b"]);
// A message that is not in the list (deleted, other folder) pins nothing.
assert.deepEqual(ids(applyListFilter(afterOpen, afterOpen, "unread", "gone")), ["b"]);

// A collapsed conversation stays listed even when its row shows a different member.
const thread = [msg("t1", { threadId: "T", isRead: true }), msg("t2", { threadId: "T", isRead: true })];
const collapsed = [thread[0]];
assert.deepEqual(ids(applyListFilter(collapsed, thread, "unread", "t2")), ["t1"]);
// Threads are per account: the same thread id in another mailbox is not pinned.
const other = msg("x", { threadId: "T", accountId: "native:b", isRead: true });
assert.deepEqual(ids(applyListFilter([thread[0], other], [...thread, other], "unread", "t2")), ["t1"]);

// Starred: un-starring the open message does not make it vanish either.
const starred = [msg("a", { isStarred: false }), msg("b", { isStarred: true })];
assert.deepEqual(ids(applyListFilter(starred, starred, "starred", "a")), ["a", "b"]);
assert.deepEqual(ids(applyListFilter(starred, starred, "starred", null)), ["b"]);

// The list really uses it, with the open message's id.
const source = readFileSync(new URL("../src/client/components/MailList.tsx", import.meta.url), "utf8");
assert.match(source, /applyListFilter\(threadedMessages, messages, filtersEnabled \? listFilter : "all", selectedId\)/);
assert.doesNotMatch(source, /threadedMessages\.filter\(\(message\) => !message\.isRead\)/);

console.log("unread filter tests passed");
