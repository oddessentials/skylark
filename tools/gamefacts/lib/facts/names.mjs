import { need } from '../game.mjs';
import { compareText } from '../output.mjs';
import { englishText, mapObjectName, PLACEHOLDER, resolveTags } from './richtext.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const BUILD_OBJECT = /^BP_BuildObject_/;

function byId(a, b) {
  return compareText(a.id, b.id);
}

export function buildNames(game, species, gameVersion) {
  const technologies = [];
  for (const [id, row] of game.dataTable(TABLES.technologies).rows) {
    const text = need(
      englishText(game, TEXTS.technologyNames, row.Name),
      `English name of technology ${id}`
    );
    technologies.push({ id, name: resolveTags(game, text, `technology ${id}`, species) });
  }
  const structures = [];
  for (const [id, row] of game.dataTable(TABLES.mapObjects).rows) {
    if (!BUILD_OBJECT.test(String(row.BlueprintClassName))) continue;
    const name = mapObjectName(game, id);
    if (name) structures.push({ id, name });
  }
  const humans = [];
  for (const id of species.humans.rows.keys()) {
    const name = species.humanName(id);
    if (name && name !== PLACEHOLDER) humans.push({ id, name });
  }
  if (technologies.length === 0) throw new Error('no technologies found');
  if (structures.length === 0) throw new Error('no buildable structures found');
  if (humans.length === 0) throw new Error('no human names found');
  return {
    game_version: gameVersion,
    sources: [
      TABLES.technologies,
      TABLES.mapObjects,
      TABLES.items,
      TABLES.humans,
      `${TEXTS.technologyNames} (en)`,
      `${TEXTS.itemNames} (en)`,
      `${TEXTS.mapObjectNames} (en)`,
      `${TEXTS.humanNames} (en)`,
      `${TEXTS.uniqueNpcNames} (en)`
    ],
    technologies: technologies.sort(byId),
    structures: structures.sort(byId),
    humans: humans.sort(byId)
  };
}
