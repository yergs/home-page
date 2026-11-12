/** The shapes a map dot can take, so one teacher's students can be told from another's. */

/** The shapes teachers are given, in the order they're handed out. */
export const teacherShapes = [
  "circle",
  "square",
  "triangle",
  "pentagon",
  "hexagon",
  "star",
  "cross",
] as const;
export type TeacherShape = (typeof teacherShapes)[number];

/** Teachers' shapes, and the diamond, which marks a family who isn't a student yet. */
export type Shape = TeacherShape | "diamond";

const clips: Readonly<Record<Shape, string>> = {
  circle: "circle(50%)",
  square: "inset(0 round 12%)",
  triangle: "polygon(50% 4%, 98% 92%, 2% 92%)",
  diamond: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
  pentagon: "polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)",
  hexagon: "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)",
  star:
    "polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
  cross:
    "polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%)",
};

/** The CSS `clip-path` that cuts a square box to the shape. */
export const shapeClip = (shape: Shape): string => clips[shape];

/** Some shapes look smaller than others at one size; this evens them out. */
export const shapeScale = (shape: Shape): number =>
  shape === "star" || shape === "cross" || shape === "triangle" ? 1.25 : 1;

/** The first shape no teacher has yet, or one reused once they're all taken. */
export const nextShape = (taken: ReadonlyArray<Shape>): TeacherShape =>
  teacherShapes.find((s) => !taken.includes(s)) ??
    teacherShapes[taken.length % teacherShapes.length] ?? "circle";
