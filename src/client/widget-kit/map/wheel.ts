/**
 * Turning scroll-wheel events into map zoom steps. A mouse wheel or trackpad sends a
 * burst of many small events for one flick, so zooming a level per event is far too fast.
 */

export type WheelState = {
  /** Scroll distance gathered so far that hasn't made a step yet, in pixels. */
  readonly pending: number;
  /** When the last step was taken, in milliseconds. */
  readonly lastStepAt: number;
};

export const initialWheel: WheelState = { pending: 0, lastStepAt: -Infinity };

/** How far to scroll for one zoom level. */
const pixelsPerStep = 100;
/** After a step, scrolling is ignored this long, so a flick's tail doesn't zoom again. */
const cooldownMs = 250;

/** An event's scroll distance in pixels, whatever unit the device reports it in. */
export const wheelPixels = (
  event: { deltaY: number; deltaMode: number; ctrlKey: boolean },
): number => {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  // A pinch on a trackpad arrives as a ctrl-wheel with much smaller numbers.
  return event.deltaY * unit * (event.ctrlKey ? 10 : 1);
};

/** Takes a wheel event in: how many levels to zoom (+1 in, -1 out, or 0), and the new state. */
export const wheelStep = (
  state: WheelState,
  deltaPixels: number,
  now: number,
): { readonly step: -1 | 0 | 1; readonly state: WheelState } => {
  if (now - state.lastStepAt < cooldownMs) {
    return { step: 0, state: { ...state, pending: 0 } };
  }
  const pending = state.pending + deltaPixels;
  if (Math.abs(pending) < pixelsPerStep) {
    return { step: 0, state: { ...state, pending } };
  }
  // Scrolling up (negative) zooms in.
  return { step: pending < 0 ? 1 : -1, state: { pending: 0, lastStepAt: now } };
};
