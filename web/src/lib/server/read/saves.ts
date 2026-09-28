import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  baseSaves,
  guildSaves,
  playerSaves,
  players,
  type BaseRow,
  type BaseSaveRow,
  type PlayerRow,
  type PlayerSaveRow
} from '../db/schema';
import { battles } from '$lib/world/bosses.json';
import { pals } from '$lib/world/pals.json';
import { speciesInfo } from '$lib/world/species';
import { displayName, playerRef, type Schemas } from './common';

export type PlayerProgress = Schemas['PlayerProgress'];
export type GuildRole = Schemas['GuildRole'];
export type GuildRosterEntry = Schemas['GuildRosterEntry'];
export type BasePal = Schemas['BasePal'];

export const palpediaTotal = pals.length;
export const baseMatchCm = 200;

const bossNames = new Map(battles.map((battle) => [battle.boss_type, battle.name]));
const towerIds = new Set(
  battles.filter((battle) => battle.category === 'faction_tower').map((battle) => battle.boss_type)
);

const roleOrder: GuildRole[] = ['guild_master', 'sub_master', 'member', 'guest', 'none'];

export function roleOf(value: string | null | undefined): GuildRole {
  return roleOrder.includes(value as GuildRole) ? (value as GuildRole) : 'none';
}

export function progressOf(row: PlayerSaveRow | null | undefined): PlayerProgress | null {
  if (!row || !row.progress || row.goneAt) return null;
  const progress = row.progress;
  const towers = progress.tower_bosses.filter((id) => towerIds.has(id) || !bossNames.has(id));
  return {
    saved_at: row.savedAt.toISOString(),
    last_online_at: row.lastOnlineAt ? row.lastOnlineAt.toISOString() : null,
    palpedia: progress.palpedia,
    palpedia_total: palpediaTotal,
    species_captured: progress.species_captured,
    captures: progress.captures,
    tower_bosses: towers.map((id) => ({ id, name: bossNames.get(id) ?? id })),
    tower_bosses_total: towerIds.size,
    field_bosses: progress.field_bosses,
    dungeon_clears: progress.dungeon_clears + progress.fixed_dungeon_clears,
    technologies: progress.technologies,
    fast_travel_points: progress.fast_travel_points
  };
}

export async function playerSaveOf(
  db: Database,
  playerUid: string | null
): Promise<PlayerSaveRow | null> {
  if (!playerUid) return null;
  const rows = await db
    .select()
    .from(playerSaves)
    .where(eq(playerSaves.playerUid, playerUid))
    .limit(1);
  return rows[0] ?? null;
}

export interface GuildSave {
  roster: GuildRosterEntry[];
  roles: Map<string, GuildRole>;
  savedAt: Date | null;
  level: number | null;
}

const emptyGuildSave = (): GuildSave => ({
  roster: [],
  roles: new Map(),
  savedAt: null,
  level: null
});

export async function guildSaveOf(db: Database, guildId: string, now: Date): Promise<GuildSave> {
  const rows = await db
    .select()
    .from(guildSaves)
    .where(and(eq(guildSaves.guildId, guildId), isNull(guildSaves.goneAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return emptyGuildSave();
  const uids = row.members.map((member) => member.player_id);
  const known = new Map<string, PlayerRow>();
  const saved = new Map<string, PlayerSaveRow>();
  if (uids.length > 0) {
    for (const player of await db.select().from(players).where(inArray(players.playerUid, uids))) {
      if (player.playerUid) known.set(player.playerUid, player);
    }
    for (const save of await db
      .select()
      .from(playerSaves)
      .where(inArray(playerSaves.playerUid, uids))) {
      saved.set(save.playerUid, save);
    }
  }
  const result = emptyGuildSave();
  result.savedAt = row.savedAt;
  result.level = row.baseCampLevel;
  for (const member of row.members) {
    const player = known.get(member.player_id);
    if (player?.hidden) continue;
    const save = saved.get(member.player_id);
    const role = roleOf(member.role);
    result.roles.set(member.player_id, role);
    const lastOnline = player?.online
      ? now
      : [player?.lastSeen, save?.lastOnlineAt].reduce<Date | null>(
          (latest, value) => (value && (!latest || value > latest) ? value : latest),
          null
        );
    result.roster.push({
      player: player ? playerRef(player) : null,
      name: player ? displayName(player) : member.name,
      role,
      level: player && player.level > 0 ? player.level : (save?.level ?? null),
      online: player?.online ?? false,
      last_online_at: lastOnline ? lastOnline.toISOString() : null
    });
  }
  result.roster.sort(
    (a, b) =>
      roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) ||
      Number(b.online) - Number(a.online) ||
      a.name.localeCompare(b.name)
  );
  return result;
}

export function basePalOf(worker: { character_id: string; level: number; name: string | null }) {
  const alpha = /^boss_/i.test(worker.character_id);
  const raw = alpha ? worker.character_id.slice(5) : worker.character_id;
  return {
    species: speciesInfo(raw)?.id ?? raw,
    alpha,
    name: worker.name,
    level: worker.level
  } satisfies BasePal;
}

export async function savedBases(db: Database): Promise<BaseSaveRow[]> {
  return db.select().from(baseSaves).where(isNull(baseSaves.goneAt));
}

export function savedBaseFor(row: BaseRow, saved: BaseSaveRow[]): BaseSaveRow | null {
  let best: BaseSaveRow | null = null;
  let bestDistance = baseMatchCm;
  for (const candidate of saved) {
    if (row.guildId && candidate.guildId && row.guildId !== candidate.guildId) continue;
    const distance = Math.hypot(candidate.x - row.x, candidate.y - row.y);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
