/** Times of day as minutes after midnight, as class times are read and shown. */

/** "4:15 PM" (or "4:15pm", "16:15") as minutes after midnight; null if it isn't a time. */
export const parseTime = (text: string): number | null => {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(text);
  if (m === null) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const half = m[3]?.toLowerCase();
  if (minute > 59 || hour > 23 || (half !== undefined && (hour < 1 || hour > 12))) return null;
  const h24 = half === undefined ? hour : (hour % 12) + (half === "pm" ? 12 : 0);
  return h24 * 60 + minute;
};

/** Minutes after midnight as "4:15 PM". */
export const formatTime = (minutes: number): string => {
  const h24 = Math.floor(minutes / 60) % 24;
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${hour}:${String(minutes % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};

/** A class's time as "4:15 – 4:45 PM", or "4:15 PM" with no end, or "" with no start. */
export const formatSpan = (start: number | null, end: number | null): string => {
  if (start === null) return "";
  if (end === null) return formatTime(start);
  const from = formatTime(start);
  const to = formatTime(end);
  // The shared AM or PM is said once.
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)} – ${to}` : `${from} – ${to}`;
};
