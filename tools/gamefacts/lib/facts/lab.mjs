import { enumValue, need } from '../game.mjs';
import { englishText, itemName, noneToNull } from './richtext.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const NO_EFFECT = 'no';

function materialsOf(game, row) {
  const materials = [];
  for (const slot of [1, 2, 3, 4]) {
    const id = noneToNull(row[`Material${slot}_Id`]);
    const count = row[`Material${slot}_Count`] ?? 0;
    if (!id || count <= 0) continue;
    materials.push({ id, name: itemName(game, id) ?? id, count });
  }
  return materials;
}

export function buildLab(game, gameVersion) {
  const unlocks = new Map();
  for (const [id, row] of game.dataTable(TABLES.technologies).rows) {
    const research = noneToNull(row.RequireResearchId);
    if (!research) continue;
    if (!unlocks.has(research)) unlocks.set(research, []);
    unlocks.get(research).push(id);
  }
  const research = [];
  for (const [id, row] of game.dataTable(TABLES.labResearch).rows) {
    const suitability = enumValue(need(row.LabCategoryWorkSuitability, `${id} suitability`));
    const effectType = enumValue(need(row.EffectType, `${id} EffectType`));
    research.push({
      id,
      name: need(
        englishText(game, TEXTS.labResearch, row.TextId),
        `English name of research ${id}`
      ),
      work: {
        suitability,
        name: englishText(game, TEXTS.ui, `COMMON_WORK_SUITABILITY_${suitability}`) ?? suitability
      },
      kind: enumValue(need(row.LabCategorySubType, `${id} LabCategorySubType`)),
      required_work: need(row.RequiredWorkAmount, `${id} RequiredWorkAmount`),
      requires: noneToNull(row.RequiredResearchId),
      materials: materialsOf(game, row),
      effect:
        effectType === NO_EFFECT
          ? null
          : {
              type: effectType,
              value: need(row.EffectValue, `${id} EffectValue`),
              work_suitability: noneToNull(enumValue(row.EffectOptionWorkSuitability)),
              item_type: noneToNull(enumValue(row.EffectOptionItemType))
            },
      effect_description: englishText(
        game,
        TEXTS.labResearch,
        row.EffectDescriptionTextIdOverwrite
      ),
      essential: row.bIsEssential === true,
      unlocks: unlocks.get(id) ?? []
    });
  }
  if (research.length === 0) throw new Error('no lab research found');
  return {
    game_version: gameVersion,
    sources: [
      TABLES.labResearch,
      TABLES.technologies,
      TEXTS.labResearch,
      TEXTS.itemNames,
      TEXTS.ui
    ],
    research
  };
}
