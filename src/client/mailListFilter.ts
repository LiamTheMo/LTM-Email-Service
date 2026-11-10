import { threadKey } from "./allInboxes.ts";
import type { MessageListItem } from "./mailTypes";

export type ListFilter = "all" | "unread" | "starred";

/**
 * Apply the list's All / Unread / Starred tab.
 *
 * Opening a message marks it read (and un-starring changes it the same way), so
 * a plain filter would drop the open message from the list the instant it opens.
 * The conversation that is open in the reader therefore always stays listed and
 * highlighted; it leaves the filtered list only once the reader closes (Back,
 * delete, archive, another folder or account) or another message is opened.
 *
 * `all` is the unfiltered, already-threaded list. `openId` is the id of the
 * message in the reader (or being opened); `source` is the list it came from, used
 * to find that message's conversation even when threading shows another member.
 */
export function applyListFilter(
  all: MessageListItem[],
  source: MessageListItem[],
  filter: ListFilter,
  openId: string | null,
): MessageListItem[] {
  if (filter === "all") return all;
  const open = openId === null ? undefined : source.find((message) => message.id === openId);
  const openKey = open ? threadKey(open) : null;
  const isOpen = (message: MessageListItem) =>
    openId !== null && (message.id === openId || (openKey !== null && threadKey(message) === openKey));
  return filter === "unread"
    ? all.filter((message) => !message.isRead || isOpen(message))
    : all.filter((message) => message.isStarred || isOpen(message));
}
