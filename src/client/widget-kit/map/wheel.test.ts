import { assertEquals } from "@std/assert";
import { initialWheel, wheelPixels, wheelStep } from "./wheel.ts";

Deno.test("wheelPixels converts lines and pages to pixels, and boosts pinches", () => {
  assertEquals(wheelPixels({ deltaY: 5, deltaMode: 0, ctrlKey: false }), 5);
  assertEquals(wheelPixels({ deltaY: 3, deltaMode: 1, ctrlKey: false }), 48);
  assertEquals(wheelPixels({ deltaY: 1, deltaMode: 2, ctrlKey: false }), 800);
  assertEquals(wheelPixels({ deltaY: -2, deltaMode: 0, ctrlKey: true }), -20);
});

Deno.test("many small events add up to one step, in the direction scrolled", () => {
  let state = initialWheel;
  const steps: Array<number> = [];
  for (let i = 0; i < 30; i++) {
    const r = wheelStep(state, -4, i * 10);
    state = r.state;
    steps.push(r.step);
  }
  // 30 events of 4 pixels is 120: one step in (up), not thirty.
  assertEquals(steps.filter((s) => s !== 0), [1]);
  assertEquals(wheelStep(initialWheel, 150, 0).step, -1);
});

Deno.test("scrolling right after a step is ignored, then counts again", () => {
  const first = wheelStep(initialWheel, -200, 1000);
  assertEquals(first.step, 1);
  const tail = wheelStep(first.state, -200, 1100);
  assertEquals(tail.step, 0);
  assertEquals(tail.state.pending, 0);
  assertEquals(wheelStep(tail.state, -200, 1300).step, 1);
});
