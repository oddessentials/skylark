export function roundHalfToEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  const rounded = fraction > 0.5 ? floor + 1 : floor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function mapAt(maps, x, y) {
  let best = null;
  for (const map of maps) {
    const inside = x >= map.min[0] && x <= map.max[0] && y >= map.min[1] && y <= map.max[1];
    if (inside && (best === null || map.priority > best.priority)) best = map;
  }
  return best ? best.id : null;
}

export function displayAt(display, x, y) {
  const axis = (spec) => roundHalfToEven(((spec.axis === 'x' ? x : y) - spec.origin) / spec.scale);
  return [axis(display.x), axis(display.y)];
}
