/** The student map's saved state, kept in this browser only: one per widget. */
import { Either } from "effect";
import { decodeState, encodeState, type SavedState } from "./saved-state.ts";

const stateKey = (widgetId: string) => `student-map:page-state:${widgetId}`;

export const savedProblem = "This is too much to keep in the browser between visits.";

export const loadState = (widgetId: string): SavedState =>
  decodeState(localStorage.getItem(stateKey(widgetId)));

/** Saves it; a message if the browser has no room. */
export const saveState = (widgetId: string, state: SavedState): string | null => {
  const saved = Either.try(() => localStorage.setItem(stateKey(widgetId), encodeState(state)));
  return Either.isLeft(saved) ? savedProblem : null;
};

export const forgetState = (widgetId: string): void => localStorage.removeItem(stateKey(widgetId));
