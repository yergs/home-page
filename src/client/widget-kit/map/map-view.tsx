/**
 * A map you can drag and zoom: OpenStreetMap tiles, a circle around the start
 * place, and a dot for each address. Only the tiles in view are requested from
 * OpenStreetMap, which shows it where the map is looking, not any address.
 */
import { Box, chakra, IconButton } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { ShapeDot } from "./shape.tsx";
import { type Shape, shapeScale } from "./shapes.ts";
import type { Coordinates } from "../../../common/geocode.ts";
import {
  circleCorners,
  fitView,
  fromWorld,
  maxZoom,
  minZoom,
  pixelsPerMile,
  toScreen,
  toWorld,
  type View,
  visibleTiles,
  zoomAt,
} from "./projection.ts";
import { initialWheel, wheelPixels, wheelStep } from "./wheel.ts";

export type Dot = {
  readonly id: number;
  readonly at: Coordinates;
  readonly label: string;
  /**
   * CSS colors to fill it with: one for a plain dot, or several, shown as equal slices of
   * a pie (e.g. one per day a student has class).
   */
  readonly colors: ReadonlyArray<string>;
  readonly shape: Shape;
};

/** A teacher's start place and how far they'll drive. */
export type Circle = {
  readonly at: Coordinates;
  /** The range to draw around it; none if 0. */
  readonly miles: number;
  readonly label: string;
  /** The shape of its marker: the one its students have. */
  readonly shape: Shape;
};

type Props = {
  readonly circles: ReadonlyArray<Circle>;
  readonly dots: ReadonlyArray<Dot>;
  readonly selected: number | null;
  readonly onSelect: (id: number) => void;
  /**
   * Any value; the map fits itself to the circles and dots when it changes (a new search),
   * and once when they first appear. Otherwise it leaves its view alone, so selecting
   * something or editing doesn't change the zoom.
   */
  readonly fitKey: unknown;
};

const useSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.width > 0) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
};

export function MapView({ circles, dots, selected, onSelect, fitKey }: Props) {
  const [ref, { width, height }] = useSize();
  const [view, setView] = useState<View>(() => fitView([], width, height));
  const drag = useRef<{ x: number; y: number } | null>(null);

  const fit = () => {
    const shown = [
      ...circles.flatMap((c) => circleCorners(c.at, c.miles)),
      ...dots.map((d) => d.at),
    ];
    setView(fitView(shown, width, height));
  };

  // Fit to everything when asked to (fitKey changes), and once when there's first something.
  const fitted = useRef(false);
  useEffect(() => {
    fitted.current = circles.length > 0 || dots.length > 0;
    fit();
  }, [fitKey]);
  useEffect(() => {
    if (!fitted.current && (circles.length > 0 || dots.length > 0)) {
      fitted.current = true;
      fit();
    }
  }, [circles, dots]);

  // Selecting a dot that's off the map (or at its edge) brings it into view, at the same zoom.
  useEffect(() => {
    const dot = dots.find((d) => d.id === selected);
    if (dot === undefined) return;
    setView((v) => {
      const p = toScreen(dot.at, v, width, height);
      const margin = 40;
      const inside = p.x >= margin && p.x <= width - margin && p.y >= margin &&
        p.y <= height - margin;
      return inside ? v : { ...v, center: dot.at };
    });
  }, [selected]);

  const zoomTo = (zoom: number) =>
    setView((v) => ({ ...v, zoom: Math.max(minZoom, Math.min(maxZoom, zoom)) }));

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const from = drag.current;
    if (from === null) return;
    drag.current = { x: e.clientX, y: e.clientY };
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    setView((v) => {
      const c = toWorld(v.center, v.zoom);
      return { ...v, center: fromWorld({ x: c.x - dx, y: c.y - dy }, v.zoom) };
    });
  };
  // Double-clicking the map zooms in a level, around the spot clicked. Dots, markers and
  // the buttons are marked data-no-zoom: they do their own thing.
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-no-zoom]") !== null) return;
    const box = e.currentTarget.getBoundingClientRect();
    setView((v) => zoomAt(v, e.clientX - box.left, e.clientY - box.top, width, height, 1));
  };

  const wheel = useRef(initialWheel);
  const onWheel = (e: React.WheelEvent) => {
    const { step, state } = wheelStep(wheel.current, wheelPixels(e), Date.now());
    wheel.current = state;
    if (step !== 0) {
      setView((v) => ({ ...v, zoom: Math.max(minZoom, Math.min(maxZoom, v.zoom + step)) }));
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <Box
      ref={ref}
      position="relative"
      overflow="hidden"
      h="100%"
      w="100%"
      bg="gray.200"
      touchAction="none"
      overscrollBehavior="contain"
      cursor="grab"
      userSelect="none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {visibleTiles(view, width, height).map((t) => (
        <chakra.img
          key={`${view.zoom}/${t.x}/${t.y}/${t.left}`}
          src={`https://tile.openstreetmap.org/${view.zoom}/${t.x}/${t.y}.png`}
          alt=""
          draggable={false}
          position="absolute"
          w="256px"
          h="256px"
          maxW="none"
          style={{ left: t.left, top: t.top }}
        />
      ))}
      {circles.map((c, i) => {
        const at = toScreen(c.at, view, width, height);
        const radiusPx = c.miles * pixelsPerMile(c.at.lat, view.zoom);
        return c.miles <= 0 ? null : (
          <Box
            key={i}
            position="absolute"
            borderRadius="full"
            border="2px solid"
            borderColor="blue.600"
            bg="blue.500/15"
            pointerEvents="none"
            style={{
              left: at.x - radiusPx,
              top: at.y - radiusPx,
              width: radiusPx * 2,
              height: radiusPx * 2,
            }}
          />
        );
      })}
      {dots.map((d) => {
        const p = toScreen(d.at, view, width, height);
        const on = d.id === selected;
        const size = on ? 20 : 14;
        const px = Math.round(size * shapeScale(d.shape));
        return (
          <Box
            key={d.id}
            title={d.label}
            data-no-zoom
            position="absolute"
            cursor="pointer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSelect(d.id)}
            style={{ left: p.x - px / 2, top: p.y - px / 2 }}
          >
            <ShapeDot
              shape={d.shape}
              size={size}
              colors={d.colors}
              outline={on ? "#f97316" : "#ffffff"}
            />
          </Box>
        );
      })}
      {circles.map((c, i) => {
        const at = toScreen(c.at, view, width, height);
        return (
          <Box
            key={i}
            title={c.label}
            data-no-zoom
            position="absolute"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ left: at.x - 12, top: at.y - 12 }}
          >
            <ShapeDot shape={c.shape} size={24} colors={["#1d4ed8"]} outline="#ffffff" />
            <Box
              position="absolute"
              left="32px"
              top="2px"
              whiteSpace="nowrap"
              bg="blue.700"
              color="white"
              fontSize="0.75rem"
              px="1.5"
              borderRadius="sm"
              pointerEvents="none"
            >
              {c.label}
            </Box>
          </Box>
        );
      })}
      <Box
        data-no-zoom
        position="absolute"
        top="3"
        left="3"
        display="flex"
        flexDirection="column"
        gap="1"
      >
        <IconButton
          aria-label="Zoom in"
          size="sm"
          colorPalette="gray"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoomTo(view.zoom + 1)}
        >
          <LuPlus />
        </IconButton>
        <IconButton
          aria-label="Zoom out"
          size="sm"
          colorPalette="gray"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoomTo(view.zoom - 1)}
        >
          <LuMinus />
        </IconButton>
      </Box>
      <Box
        position="absolute"
        right="1"
        bottom="1"
        bg="whiteAlpha.800"
        color="black"
        fontSize="0.7rem"
        px="1"
      >
        © OpenStreetMap contributors
      </Box>
    </Box>
  );
}
