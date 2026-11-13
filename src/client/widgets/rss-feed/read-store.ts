/**
 * Keeps each feed widget's read marks in this browser only (localStorage), so a story
 * marked read stays hidden after the page reloads or the feed refreshes. They're never
 * sent anywhere or saved with the page's layout.
 */
import { Either } from "effect";
import { useCallback, useState } from "react";
import { decodeMarks, encodeMarks, markAllUnread, markRead, markUnread } from "./read-marks.ts";

const keyOf = (widgetId: string) => `rss-feed:read:${widgetId}`;

export type ReadMarks = {
  readonly ids: ReadonlyArray<string>;
  readonly mark: (id: string) => void;
  readonly unmark: (id: string) => void;
  /** Marks all of these unread. */
  readonly unmarkAll: (drop: ReadonlyArray<string>) => void;
};

/** The read marks of one feed widget, and ways to change them. */
export const useReadMarks = (widgetId: string): ReadMarks => {
  const [ids, setIds] = useState<ReadonlyArray<string>>(() =>
    decodeMarks(localStorage.getItem(keyOf(widgetId)))
  );
  const change = useCallback((next: (ids: ReadonlyArray<string>) => ReadonlyArray<string>) => {
    setIds((current) => {
      const updated = next(current);
      // If the browser has no room, the marks last until the page closes, no longer.
      Either.try(() => localStorage.setItem(keyOf(widgetId), encodeMarks(updated)));
      return updated;
    });
  }, [widgetId]);
  return {
    ids,
    mark: (id) => change((current) => markRead(current, id)),
    unmark: (id) => change((current) => markUnread(current, id)),
    unmarkAll: (drop) => change((current) => markAllUnread(current, drop)),
  };
};
