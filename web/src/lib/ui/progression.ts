import type {
  Progression,
  ProgressionFieldBoss,
  ProgressionPlayer,
  ProgressionTower,
  ProgressionTowerClear
} from '$lib/api/types';
import { formatDate, formatHours } from './format';
import type { BossMarker } from './map';

export interface TowerCell {
  tower: ProgressionTower;
  normal: ProgressionTowerClear | null;
  hard: ProgressionTowerClear | null;
}

export interface TowerRow {
  index: number;
  player: ProgressionPlayer;
  cells: TowerCell[];
  cleared: number;
}

export interface BossLegendEntry {
  index: number;
  name: string;
  color: string;
  beaten: number;
}

export interface LevelPoint {
  index: number;
  name: string;
  hours: number;
  level: number;
}

const palette = [
  '#0d6e86',
  '#9a4b07',
  '#6a3fa0',
  '#2c6e2a',
  '#b02f26',
  '#1e7fc4',
  '#8a5200',
  '#5c5244'
];
export const nobodyColor = 'var(--color-line-strong)';

export const notSeenLive = [
  'Not seen live: hard-mode tower clears (the save keys them <tower>_Hard, read from the server binary), raid clears (no key form seen), the World Tree and Panthalus tower keys, and the World Tree map flag; they are shown as the save records them.',
  'First-seen dates come from the server mod where it saw the tower fall or the technology unlocked; the save itself carries no dates. Lab completions, quest completions and field boss kills have no mod hook yet.'
];

export function playerColor(index: number): string {
  return palette[((index % palette.length) + palette.length) % palette.length]!;
}

export function towerRows(data: Progression): TowerRow[] {
  return data.players.map((player, index) => {
    const cells = data.towers.map((tower) => ({
      tower,
      normal: player.towers.find((c) => c.tower === tower.id && c.difficulty === 'normal') ?? null,
      hard: player.towers.find((c) => c.tower === tower.id && c.difficulty === 'hard') ?? null
    }));
    return {
      index,
      player,
      cells,
      cleared: cells.filter((cell) => cell.normal || cell.hard).length
    };
  });
}

export function describeClear(
  tower: ProgressionTower,
  clear: ProgressionTowerClear | null,
  local = false
): string {
  if (!clear) return `${tower.name}: not yet`;
  const times = clear.count === 1 ? 'once' : `${clear.count} times`;
  const seen = clear.first_seen_at
    ? `, first seen ${formatDate(clear.first_seen_at, local)}`
    : ', date not seen by the mod';
  return `${tower.name}, ${clear.difficulty}: ${times}${seen}`;
}

export function storyLine(story: ProgressionPlayer['story']): string {
  const at = story.stage ? `at “${story.stage.title}”` : 'not started';
  const next = story.current[0] ? `, now “${story.current[0].title}”` : '';
  return `${story.completed} of ${story.total}, ${at}${next}`;
}

export function tierLine(technology: ProgressionPlayer['technology']): string {
  const parts = [
    `tier ${technology.tier}`,
    `${technology.unlocked} of ${technology.total} unlocked`
  ];
  if (technology.boss_unlocked > 0) parts.push(`${technology.boss_unlocked} ancient`);
  if (technology.points > 0 || technology.boss_points > 0) {
    parts.push(`${technology.points} + ${technology.boss_points} points unspent`);
  }
  return parts.join(', ');
}

export function bossColor(boss: ProgressionFieldBoss): string {
  const first = boss.beaten_by[0];
  return first === undefined ? nobodyColor : playerColor(first);
}

export function describeBoss(boss: ProgressionFieldBoss, players: ProgressionPlayer[]): string {
  const who = boss.beaten_by.map((index) => players[index]?.name).filter(Boolean);
  const head = `${boss.title ? `${boss.title} ` : ''}${boss.name}, level ${boss.level}`;
  return who.length > 0 ? `${head}: beaten by ${who.join(', ')}` : `${head}: not beaten yet`;
}

export function bossMarkersOf(data: Progression): BossMarker[] {
  return data.field_bosses.map((boss) => ({
    id: boss.spawner,
    x: boss.x,
    y: boss.y,
    color: bossColor(boss),
    label: describeBoss(boss, data.players),
    beaten: boss.beaten_by.length > 0
  }));
}

export function bossLegend(data: Progression): BossLegendEntry[] {
  return data.players
    .map((player, index) => ({
      index,
      name: player.name,
      color: playerColor(index),
      beaten: data.field_bosses.filter((boss) => boss.beaten_by.includes(index)).length
    }))
    .filter((entry) => entry.beaten > 0)
    .sort((a, b) => b.beaten - a.beaten || a.name.localeCompare(b.name));
}

export function beatenCount(data: Progression): number {
  return data.field_bosses.filter((boss) => boss.beaten_by.length > 0).length;
}

export function levelPoints(players: ProgressionPlayer[]): LevelPoint[] {
  return players.flatMap((player, index) =>
    player.playtime_s !== null && player.level !== null && player.level > 0
      ? [{ index, name: player.name, hours: player.playtime_s / 3600, level: player.level }]
      : []
  );
}

export function describePoint(point: LevelPoint): string {
  return `${point.name}: level ${point.level} after ${formatHours(point.hours * 3600)}`;
}
