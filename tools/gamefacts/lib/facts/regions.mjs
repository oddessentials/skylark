import { need } from '../game.mjs';
import { boxCorners, convexHull, polygonArea } from '../geometry.mjs';
import { compareText, round, roundAll } from '../output.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const BOX_CLASS = 'BoxComponent';
const SPHERE_CLASS = 'SphereComponent';
const ENGINE_DEFAULT_BOX_EXTENT = [32, 32, 32];
const ENGINE_DEFAULT_SPHERE_RADIUS = 32;

function boxShape(world, level, index) {
  const transform = world.worldTransform(level, index);
  const extent = world.properties(level, index).BoxExtent ?? ENGINE_DEFAULT_BOX_EXTENT;
  const corners = boxCorners(transform, extent);
  const footprint = convexHull(corners.map(([x, y]) => [round(x), round(y)]));
  const heights = corners.map((corner) => corner[2]);
  return {
    type: 'box',
    center: roundAll(transform.translation),
    z: [round(Math.min(...heights)), round(Math.max(...heights))],
    area: Math.round(polygonArea(footprint)),
    footprint
  };
}

function sphereShape(world, level, index) {
  const transform = world.worldTransform(level, index);
  const radius =
    (world.properties(level, index).SphereRadius ?? ENGINE_DEFAULT_SPHERE_RADIUS) *
    Math.min(...transform.scale.map(Math.abs));
  const [x, y, z] = transform.translation;
  return {
    type: 'sphere',
    center: roundAll([x, y, z]),
    radius: round(radius),
    z: [round(z - radius), round(z + radius)],
    area: Math.round(Math.PI * radius * radius)
  };
}

export function buildRegions(game, world, triggers, gameVersion) {
  const areas = game.dataTable(TABLES.worldMapAreas);
  const shapesByArea = new Map();
  const unmatched = [];
  for (const { level, index } of triggers) {
    const key = need(world.properties(level, index).AreaName?.Key, `${level.path} region key`);
    const shapes = [];
    for (const child of level.childrenOf(index)) {
      const className = level.className(child);
      if (className === BOX_CLASS) shapes.push(boxShape(world, level, child));
      else if (className === SPHERE_CLASS) shapes.push(sphereShape(world, level, child));
    }
    if (shapes.length === 0) throw new Error(`region trigger ${key} has no shapes`);
    const areaName = areas.rowName(key);
    if (!areaName) {
      unmatched.push(key);
      continue;
    }
    if (!shapesByArea.has(areaName)) shapesByArea.set(areaName, []);
    shapesByArea.get(areaName).push(...shapes);
  }

  const regions = [];
  for (const [id, row] of areas.rows) {
    const shapes = (shapesByArea.get(id) ?? []).sort(
      (a, b) => a.center[0] - b.center[0] || a.center[1] - b.center[1] || a.center[2] - b.center[2]
    );
    const largest = shapes.reduce(
      (best, shape) => (best && best.area >= shape.area ? best : shape),
      null
    );
    regions.push({
      id,
      text_id: row.MsgID,
      name: game.lookupText([TEXTS.worldMap], row.MsgID),
      label: largest ? [largest.center[0], largest.center[1]] : null,
      shapes
    });
  }
  return {
    game_version: gameVersion,
    sources: [
      TABLES.worldMapAreas,
      TEXTS.worldMap,
      '/Game/Pal/Maps/MainWorld_5/PL_MainWorld5 BP_PalRegionTriggerBox and BP_PalRegionTriggerSphere actors'
    ],
    regions,
    triggers_without_area: [...new Set(unmatched)].sort(compareText)
  };
}
