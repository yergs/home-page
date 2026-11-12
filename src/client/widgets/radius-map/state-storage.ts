/** The radius map's own saved state in this browser (see saved-state.ts). */
import { Either } from "effect";
import { decodeState, encodeState, type SavedState } from "./saved-state.ts";

/** What the page says when the browser has no room to keep the CSV. */
export const savedProblem = "This file is too big to keep in the browser between visits.";

/** Where one radius map widget keeps its state, so each widget has its own. */
const stateKey = (widgetId: string) => `radius-map:page-state:${widgetId}`;

/** Where the state was kept when there was one map for every widget, before full-screen views. */
const sharedStateKey = "radius-map:page-state";

/**
 * The CSV, column choices and teachers this widget saved in this browser. A widget
 * with none yet starts from what was saved before each widget had its own.
 */
export const loadState = (widgetId: string): SavedState =>
  decodeState(localStorage.getItem(stateKey(widgetId)) ?? localStorage.getItem(sharedStateKey));

/** Saves them in this browser only. Fails with a message if the browser has no room (a huge CSV). */
export const saveState = (widgetId: string, state: SavedState): string | null => {
  const saved = Either.try(() => localStorage.setItem(stateKey(widgetId), encodeState(state)));
  return Either.isLeft(saved) ? savedProblem : null;
};

export const forgetState = (widgetId: string): void => {
  localStorage.removeItem(stateKey(widgetId));
  localStorage.removeItem(sharedStateKey);
};
