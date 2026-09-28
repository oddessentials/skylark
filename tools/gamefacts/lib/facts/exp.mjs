import { need } from '../game.mjs';
import { classDefaults } from './breeding.mjs';
import { BLUEPRINTS, TABLES } from './sources.mjs';

export function buildExp(game, gameVersion) {
  const defaults = classDefaults(game);
  const maxLevel = need(defaults.CharacterMaxLevel, 'CharacterMaxLevel');
  const levels = [];
  for (const [id, row] of game.dataTable(TABLES.exp).rows) {
    const level = Number(id);
    if (!Number.isInteger(level) || level < 1 || level > maxLevel) continue;
    levels.push({
      level,
      next: need(row.NextEXP, `${id} NextEXP`),
      total: need(row.TotalEXP, `${id} TotalEXP`),
      pal_next: need(row.PalNextEXP, `${id} PalNextEXP`),
      pal_total: need(row.PalTotalEXP, `${id} PalTotalEXP`)
    });
  }
  levels.sort((a, b) => a.level - b.level);
  levels.forEach((entry, index) => {
    if (entry.level !== index + 1) throw new Error(`the exp table skips level ${index + 1}`);
  });
  if (levels.length !== maxLevel) throw new Error(`the exp table stops at level ${levels.length}`);
  return {
    game_version: gameVersion,
    sources: [TABLES.exp, BLUEPRINTS.gameSetting],
    max_level: maxLevel,
    levels
  };
}
