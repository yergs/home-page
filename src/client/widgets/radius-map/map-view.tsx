/**
 * A map you can drag and zoom: OpenStreetMap tiles, a circle around the start
 * place, and a dot for each address. Only the tiles in view are requested from
 * OpenStreetMap, which shows it where the map is looking, not any address.
 */
import { Box, chakra, IconButton } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
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
} from "./projection.ts";

export type Dot = {
  readonly id: number;
  readonly at: Coordinates;
  readonly label: string;
  /** Out of every teacher's reach: drawn gray, not red. */
  readonly covered: boolean;
};

/** A teacher's start place and how far they'll drive. */
export type Circle = {
  readonly at: Coordinates;
  readonly miles: number;
  readonly label: string;
};

type Props = {
  readonly circles: ReadonlyArray<Circle>;
  readonly dots: ReadonlyArray<Dot>;
  readonly selected: number | null;
  readonly onSelect: (id: number) => void;
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

export function MapView({ circles, dots, selected, onSelect }: Props) {
  const [ref, { width, height }] = useSize();
  const [view, setView] = useState<View>(() => fitView([], width, height));
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Refit whenever the start place or radius changes, or new results arrive.
  useEffect(() => {
    const shown = [
      ...circles.flatMap((c) => circleCorners(c.at, c.miles)),
      ...dots.map((d) => d.at),
    ];
    setView(fitView(shown, width, height));
  }, [circles, dots]);

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
      cursor="grab"
      userSelect="none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={(e) => zoomTo(view.zoom + (e.deltaY < 0 ? 1 : -1))}
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
        return (
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
        return (
          <Box
            key={d.id}
            title={d.label}
            position="absolute"
            borderRadius="full"
            border="2px solid white"
            bg={on ? "orange.500" : d.covered ? "red.600" : "gray.600"}
            boxShadow="0 0 0 1px rgba(0,0,0,0.5)"
            cursor="pointer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSelect(d.id)}
            style={{
              left: p.x - (on ? 9 : 6),
              top: p.y - (on ? 9 : 6),
              width: on ? 18 : 12,
              height: on ? 18 : 12,
            }}
          />
        );
      })}
      {circles.map((c, i) => {
        const at = toScreen(c.at, view, width, height);
        return (
          <Box
            key={i}
            title={c.label}
            position="absolute"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ left: at.x - 9, top: at.y - 9 }}
          >
            <Box
              borderRadius="full"
              border="3px solid white"
              bg="blue.700"
              boxShadow="0 0 0 1px rgba(0,0,0,0.6)"
              style={{ width: 18, height: 18 }}
            />
            <Box
              position="absolute"
              left="22px"
              top="0"
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
      <Box position="absolute" top="3" left="3" display="flex" flexDirection="column" gap="1">
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
