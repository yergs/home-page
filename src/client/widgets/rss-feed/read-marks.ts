/** Which of a feed's stories the user has marked as read, and what that leaves to show. */
import { Either, Schema } from "effect";

/** The most read marks kept per feed: older stories have dropped off the feed by then. */
export const maxRemembered = 300;

const Ids = Schema.Array(Schema.String);

/** The marks as saved text: the ids of the stories marked, oldest first. */
export const encodeMarks = (ids: ReadonlyArray<string>): string => JSON.stringify(ids);

/** The marks from saved text; none if there's nothing saved or it isn't readable. */
export const decodeMarks = (stored: string | null): ReadonlyArray<string> => {
  if (stored === null) return [];
  const parsed = Either.try(() => JSON.parse(stored) as unknown);
  const decoded = Either.flatMap(parsed, Schema.decodeUnknownEither(Ids));
  return Either.isLeft(decoded) ? [] : decoded.right;
};

/** The marks with one more, the oldest dropped past {@link maxRemembered}. */
export const markRead = (ids: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  ids.includes(id) ? ids : [...ids, id].slice(-maxRemembered);

/** The marks without `id`. */
export const markUnread = (ids: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  ids.filter((i) => i !== id);

/** The marks without any of `drop`. */
export const markAllUnread = (
  ids: ReadonlyArray<string>,
  drop: ReadonlyArray<string>,
): ReadonlyArray<string> => ids.filter((i) => !drop.includes(i));

/** The items to show, in the feed's order: the unread ones, or all of them if `showRead`. */
export const itemsToShow = <T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
  ids: ReadonlyArray<string>,
  showRead: boolean,
): ReadonlyArray<T> => showRead ? items : items.filter((i) => !ids.includes(i.id));

/** How many of the items are marked read. */
export const readCount = (
  items: ReadonlyArray<{ readonly id: string }>,
  ids: ReadonlyArray<string>,
): number => items.filter((i) => ids.includes(i.id)).length;
