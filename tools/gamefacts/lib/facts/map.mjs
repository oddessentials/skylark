import { need } from '../game.mjs';
import { readFunction } from '../kismet.mjs';
import { round } from '../output.mjs';
import { evaluate } from '../symbolic.mjs';
import { BLUEPRINTS, TABLES, TEXTS } from './sources.mjs';

const ROUNDING_MODES = [
  'HalfToEven',
  'HalfFromZero',
  'HalfToZero',
  'FromZero',
  'ToZero',
  'ToNegativeInfinity',
  'ToPositiveInfinity'
];

function axisOf(symbol, owner) {
  const match = new RegExp(`^${owner}\\.([xyz])$`).exec(symbol ?? '');
  return match ? match[1] : null;
}

function normalizedAxis(node) {
  const range = node?.mapRange;
  if (!range) return null;
  const axis = axisOf(range.value.symbol, 'worldLocation');
  if (!axis) return null;
  if (axisOf(range.inA.symbol, 'landscapeMinXY') !== axis) return null;
  if (axisOf(range.inB.symbol, 'landscapeMaxXY') !== axis) return null;
  if (range.outA.number !== 0 || range.outB.number !== 1) return null;
  return axis;
}

function readImageTransform(game) {
  const functionName = 'WorldLocationToWidgetOffset';
  const pkg = game.asset(BLUEPRINTS.uiFunctions);
  const { environment } = evaluate(readFunction(pkg, functionName));
  const offset = need(environment.get('offset')?.vector, `${functionName} result`);
  const u = normalizedAxis(offset[0]);
  const inverted = offset[1]?.subtract;
  const v = inverted && inverted[0].number === 1 ? normalizedAxis(inverted[1]) : null;
  if (!u || !v) throw new Error(`${functionName} does not have the expected shape`);
  return {
    function: `BP_PalUIFunctionLibrary.${functionName}`,
    u: { axis: u, invert: false },
    v: { axis: v, invert: true }
  };
}

function readDisplayCoordinates(game) {
  const functionName = 'PrintPosition';
  const pkg = game.asset(BLUEPRINTS.mapWidget);
  const { effects } = evaluate(readFunction(pkg, functionName));
  const text = effects.find((effect) => effect.effect === 'SetText' && effect.value?.format);
  if (!text) throw new Error(`${functionName} sets no formatted text`);
  const argumentsByName = {};
  for (const item of need(text.value.arguments?.list, `${functionName} format arguments`)) {
    const name = item.fields?.ArgumentName?.string;
    if (name) argumentsByName[name] = item.fields.ArgumentValue;
  }
  const axis = (argumentName) => {
    const value = need(argumentsByName[argumentName], `${functionName} argument ${argumentName}`);
    const range = need(value.toText?.mapRange, `${functionName} argument ${argumentName} range`);
    const worldAxis = axisOf(range.value.symbol, 'GetCursorWorldLocation');
    const numbers = [range.inA, range.inB, range.outA, range.outB].map((entry) => entry.number);
    if (!worldAxis || numbers.some((number) => typeof number !== 'number')) {
      throw new Error(`${functionName} argument ${argumentName} does not have the expected shape`);
    }
    const [inA, inB, outA, outB] = numbers;
    const scale = (inB - inA) / (outB - outA);
    return {
      axis: worldAxis,
      from: [inA, inB],
      to: [outA, outB],
      origin: round(inA - outA * scale, 6),
      scale: round(scale, 6),
      rounding: ROUNDING_MODES[value.rounding] ?? String(value.rounding),
      fraction_digits: value.maximumFractionalDigits
    };
  };
  return {
    function: `WBP_Map_Base.${functionName}`,
    format: text.value.format,
    x: axis('x'),
    y: axis('y')
  };
}

export function buildMap(game, gameVersion) {
  const table = game.dataTable(TABLES.worldMapUi);
  const maps = [];
  for (const [id, row] of table.rows) {
    const min = need(row.landScapeRealPositionMin, `${id}.landScapeRealPositionMin`);
    const max = need(row.landScapeRealPositionMax, `${id}.landScapeRealPositionMax`);
    const textures = (row.textureDataMap ?? []).map(([, value]) => value.texture.split('.')[0]);
    maps.push({
      id,
      name: game.lookupText([TEXTS.worldMap], `WORLDMAP_NAME_${id}`),
      priority: row.WorldMapPriority ?? 0,
      min: [min[0], min[1]],
      max: [max[0], max[1]],
      textures,
      texture_block_size: row.minMapTextureBlockSize
    });
  }
  maps.sort((a, b) => a.priority - b.priority);
  return {
    game_version: gameVersion,
    sources: [
      TABLES.worldMapUi,
      `${BLUEPRINTS.uiFunctions} WorldLocationToWidgetOffset`,
      `${BLUEPRINTS.mapWidget} PrintPosition`
    ],
    maps,
    image: readImageTransform(game),
    display: readDisplayCoordinates(game)
  };
}
