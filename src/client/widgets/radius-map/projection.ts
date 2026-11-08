/** Web Mercator map math: where a place is on the map at a zoom level, and how to fit a view. */
import type { Coordinates } from "../../../common/geocode.ts";

export const tileSize = 256;
export const minZoom = 2;
export const maxZoom = 18;

const maxLat = 85.0511;
const clampLat = (lat: number) => Math.max(-maxLat, Math.min(maxLat, lat));

/** A place's position on the whole-world map at `zoom`, in pixels from its top left. */
export const toWorld = (at: Coordinates, zoom: number): { x: number; y: number } => {
  const scale = tileSize * 2 ** zoom;
  const sin = Math.sin(clampLat(at.lat) * Math.PI / 180);
  return {
    x: (at.lon + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
};

/** The place at a position on the whole-world map at `zoom`. */
export const fromWorld = (p: { x: number; y: number }, zoom: number): Coordinates => {
  const scale = tileSize * 2 ** zoom;
  const n = Math.PI - 2 * Math.PI * p.y / scale;
  return { lon: p.x / scale * 360 - 180, lat: Math.atan(Math.sinh(n)) * 180 / Math.PI };
};

/** How many map pixels a mile is, at this latitude and zoom. */
export const pixelsPerMile = (lat: number, zoom: number): number =>
  1609.344 / (156543.03392 * Math.cos(clampLat(lat) * Math.PI / 180) / 2 ** zoom);

export type View = { readonly center: Coordinates; readonly zoom: number };

/** The most zoomed-in view that shows all the places, with some room around them. */
export const fitView = (
  places: ReadonlyArray<Coordinates>,
  width: number,
  height: number,
): View => {
  const first = places.at(0);
  if (first === undefined) {
    return { center: { lat: 39.5, lon: -98.35 }, zoom: minZoom + 1 };
  }
  const lats = places.map((p) => p.lat);
  const lons = places.map((p) => p.lon);
  const box = {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lons),
    west: Math.min(...lons),
  };
  const center = { lat: (box.north + box.south) / 2, lon: (box.east + box.west) / 2 };
  const room = 0.85;
  for (let zoom = maxZoom; zoom > minZoom; zoom--) {
    const nw = toWorld({ lat: box.north, lon: box.west }, zoom);
    const se = toWorld({ lat: box.south, lon: box.east }, zoom);
    if ((se.x - nw.x) <= width * room && (se.y - nw.y) <= height * room) {
      return { center, zoom };
    }
  }
  return { center, zoom: minZoom };
};

/** The corners of the square that holds a circle of `miles` around `center`, to fit a view to. */
export const circleCorners = (center: Coordinates, miles: number): ReadonlyArray<Coordinates> => {
  const dLat = miles / 69.0;
  const dLon = miles / (69.17 * Math.cos(clampLat(center.lat) * Math.PI / 180));
  return [
    { lat: center.lat + dLat, lon: center.lon - dLon },
    { lat: center.lat - dLat, lon: center.lon + dLon },
  ];
};

export type Tile = {
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly top: number;
};

/** The tiles that cover a `width` by `height` view, and where each goes in it. */
export const visibleTiles = (view: View, width: number, height: number): ReadonlyArray<Tile> => {
  const zoom = view.zoom;
  const centerPx = toWorld(view.center, zoom);
  const originX = centerPx.x - width / 2;
  const originY = centerPx.y - height / 2;
  const count = 2 ** zoom;
  const tiles: Array<Tile> = [];
  for (
    let ty = Math.floor(originY / tileSize);
    ty <= Math.floor((originY + height) / tileSize);
    ty++
  ) {
    for (
      let tx = Math.floor(originX / tileSize);
      tx <= Math.floor((originX + width) / tileSize);
      tx++
    ) {
      if (ty >= 0 && ty < count) {
        tiles.push({
          x: ((tx % count) + count) % count,
          y: ty,
          left: tx * tileSize - originX,
          top: ty * tileSize - originY,
        });
      }
    }
  }
  return tiles;
};

/** Where a place is in a `width` by `height` view, in pixels from its top left. */
export const toScreen = (
  at: Coordinates,
  view: View,
  width: number,
  height: number,
): { x: number; y: number } => {
  const zoom = view.zoom;
  const p = toWorld(at, zoom);
  const c = toWorld(view.center, zoom);
  return { x: p.x - c.x + width / 2, y: p.y - c.y + height / 2 };
};
