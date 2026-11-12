/** A map dot drawn as a shape: filled with one color or a pie of several, with an outline. */
import { Box } from "@chakra-ui/react";
import { type Shape, shapeClip, shapeScale } from "./shapes.ts";

/** A fill: a color, or several as equal slices of a pie. */
export const fillOf = (colors: ReadonlyArray<string>): string => {
  const [first] = colors;
  if (first === undefined) return "#6b7280";
  if (colors.length === 1) return first;
  const slice = 100 / colors.length;
  return `conic-gradient(${
    colors.map((c, i) => `${c} ${i * slice}% ${(i + 1) * slice}%`).join(", ")
  })`;
};

type Props = {
  readonly shape: Shape;
  /** Its width and height, in pixels, before the shape's own adjustment. */
  readonly size: number;
  readonly colors: ReadonlyArray<string>;
  /** The outline's color: white, or orange for the selected one. */
  readonly outline: string;
};

export function ShapeDot({ shape, size, colors, outline }: Props) {
  const px = Math.round(size * shapeScale(shape));
  const clip = shapeClip(shape);
  return (
    <Box
      position="relative"
      flexShrink={0}
      style={{ width: px, height: px, filter: "drop-shadow(0 0 1px rgba(0,0,0,0.8))" }}
    >
      <Box position="absolute" inset="0" style={{ clipPath: clip, background: outline }} />
      <Box
        position="absolute"
        style={{ inset: 2, clipPath: clip, background: fillOf(colors) }}
      />
    </Box>
  );
}
