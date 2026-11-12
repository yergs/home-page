import { assertEquals } from "@std/assert";
import { nextShape, shapeClip, shapeScale, teacherShapes } from "./shapes.ts";

Deno.test("every shape has a clip, and the diamond isn't handed out to teachers", () => {
  for (const s of [...teacherShapes, "diamond" as const]) {
    assertEquals(shapeClip(s).length > 0, true);
  }
  assertEquals(teacherShapes.includes("diamond" as never), false);
});

Deno.test("nextShape hands out unused shapes first, then starts again", () => {
  assertEquals(nextShape([]), "circle");
  assertEquals(nextShape(["circle", "triangle"]), "square");
  assertEquals(nextShape([...teacherShapes]), "circle");
  assertEquals(nextShape([...teacherShapes, "circle"]), "square");
});

Deno.test("narrow shapes are drawn a little larger", () => {
  assertEquals([shapeScale("circle"), shapeScale("star")], [1, 1.25]);
});
