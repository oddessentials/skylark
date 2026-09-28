import { need } from '../game.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const NAME_PREFIX = 'COMMON_ELEMENT_NAME_';

function srgbChannel(linear) {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded =
    clamped <= 0.0031308 ? clamped * 12.92 : Math.pow(clamped, 1 / 2.4) * 1.055 - 0.055;
  return Math.floor(encoded * 255.999);
}

function hex(channels) {
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function buildElements(game, gameVersion) {
  const ui = game.dataTable(TEXTS.ui, 'en');
  const styles = game.dataTable(TABLES.richTextStyles);
  const elements = [];
  for (const [key, row] of ui.rows) {
    if (!key.startsWith(NAME_PREFIX)) continue;
    const id = key.slice(NAME_PREFIX.length);
    const name = need(row.TextData, `English name of element ${id}`);
    const styleName = `Elem_${name}`;
    const style = need(styles.row(styleName), `rich text style ${styleName}`);
    const linear = need(
      style.TextStyle?.ColorAndOpacity?.SpecifiedColor,
      `${styleName}.TextStyle.ColorAndOpacity.SpecifiedColor`
    );
    elements.push({
      id,
      name,
      color: hex(linear.slice(0, 3).map(srgbChannel)),
      style: styleName
    });
  }
  if (elements.length === 0) throw new Error('no element names found');
  return {
    game_version: gameVersion,
    sources: [`${TEXTS.ui} (en)`, TABLES.richTextStyles],
    elements
  };
}
