import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  baseSaves,
  bases,
  eggSaves,
  guildSaves,
  guilds,
  palSaves,
  players,
  type BaseRow,
  type BaseSaveRow,
  type EggSaveRow,
  type PalSaveRow,
  type PlayerRow,
  type SavedHatchling
} from '../db/schema';
import { notFound } from '../http/respond';
import { eggKind, passiveFact } from '$lib/breeding';
import { regionAt } from '$lib/world/regions';
import { speciesInfo } from '$lib/world/species';
import { displayName, playerRef, type Schemas } from './common';
import { baseMatchCm } from './saves';

export type GuildPals = Schemas['GuildPals'];
export type GuildPal = Schemas['GuildPal'];
export type GuildEgg = Schemas['GuildEgg'];
export type PalPassive = Schemas['PalPassive'];
export type PalGender = Schemas['PalGender'];

export function passiveOf(id: string): PalPassive {
  const fact = passiveFact(id);
  return fact ? { id: fact.id, name: fact.name, rank: fact.rank } : { id, name: id, rank: 0 };
}

function genderOf(value: string | null): PalGender | null {
  return value === 'male' || value === 'female' ? value : null;
}

function speciesIdOf(value: string): string {
  return speciesInfo(value)?.id ?? value;
}

function hatchlingOf(value: SavedHatchling | null): GuildEgg['hatched'] {
  if (!value) return null;
  return {
    species: speciesIdOf(value.species),
    alpha: value.alpha,
    gender: genderOf(value.gender),
    level: value.level,
    rank: value.rank,
    talents: value.talents,
    passives: value.passives.map(passiveOf),
    lucky: value.lucky
  };
}

export function siteBaseFor(saved: BaseSaveRow, standing: BaseRow[]): BaseRow | null {
  let best: BaseRow | null = null;
  let bestDistance = baseMatchCm;
  for (const row of standing) {
    if (row.guildId && saved.guildId && row.guildId !== saved.guildId) continue;
    const distance = Math.hypot(row.x - saved.x, row.y - saved.y);
    if (distance <= bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

const placeOrder = ['party', 'box'];
const eggPlaceOrder = ['inventory', 'base', 'incubator'];

function palOf(row: PalSaveRow, member: number): GuildPal {
  return {
    id: row.instanceId,
    member,
    species: speciesIdOf(row.species),
    alpha: row.alpha,
    gender: genderOf(row.gender),
    level: row.level,
    rank: row.rank,
    talents: { hp: row.talentHp, shot: row.talentShot, defense: row.talentDefense },
    passives: row.passives.map(passiveOf),
    lucky: row.lucky,
    name: row.name,
    where: row.place === 'party' ? 'party' : 'box'
  };
}

function eggOf(row: EggSaveRow, member: number | null, base: Schemas['BaseRef'] | null): GuildEgg {
  const kind = eggKind(row.itemId);
  return {
    id: row.eggId,
    kind: kind?.id ?? row.itemId,
    kind_name: kind?.name ?? row.itemId,
    species: speciesIdOf(row.species),
    alpha: row.alpha,
    where: row.place === 'incubator' ? 'incubator' : row.place === 'base' ? 'base' : 'inventory',
    member,
    base,
    hatched: row.place === 'incubator' ? hatchlingOf(row.hatched) : null
  };
}

export async function getGuildPals(db: Database, id: string): Promise<GuildPals> {
  const found = await db.select().from(guilds).where(eq(guilds.id, id)).limit(1);
  const guild = found[0];
  if (!guild) throw notFound(`guild ${id} does not exist`);
  const rosters = await db
    .select()
    .from(guildSaves)
    .where(and(eq(guildSaves.guildId, id), isNull(guildSaves.goneAt)))
    .limit(1);
  const roster = rosters[0];
  const uids = roster ? roster.members.map((member) => member.player_id) : [];
  const known = new Map<string, PlayerRow>();
  let palRows: PalSaveRow[] = [];
  let inventoryEggs: EggSaveRow[] = [];
  if (uids.length > 0) {
    for (const player of await db.select().from(players).where(inArray(players.playerUid, uids))) {
      if (player.playerUid) known.set(player.playerUid, player);
    }
    palRows = await db
      .select()
      .from(palSaves)
      .where(and(inArray(palSaves.playerUid, uids), isNull(palSaves.goneAt)));
    inventoryEggs = await db
      .select()
      .from(eggSaves)
      .where(and(inArray(eggSaves.playerUid, uids), isNull(eggSaves.goneAt)));
  }
  const savedBases = await db
    .select()
    .from(baseSaves)
    .where(and(eq(baseSaves.guildId, id), isNull(baseSaves.goneAt)));
  let baseEggs: EggSaveRow[] = [];
  if (savedBases.length > 0) {
    baseEggs = await db
      .select()
      .from(eggSaves)
      .where(
        and(
          inArray(
            eggSaves.baseId,
            savedBases.map((row) => row.baseId)
          ),
          isNull(eggSaves.goneAt)
        )
      );
  }
  const standing =
    savedBases.length > 0
      ? await db
          .select()
          .from(bases)
          .where(and(eq(bases.guildId, id), isNull(bases.goneAt)))
      : [];
  const baseRefs = new Map<string, Schemas['BaseRef'] | null>();
  for (const saved of savedBases) {
    const site = siteBaseFor(saved, standing);
    baseRefs.set(
      saved.baseId,
      site ? { id: site.id, name: site.name, region: regionAt(site.x, site.y) } : null
    );
  }

  const memberIndex = new Map<string, number>();
  const members: GuildPals['members'] = [];
  if (roster) {
    for (const member of roster.members) {
      const player = known.get(member.player_id);
      if (player?.hidden) continue;
      memberIndex.set(member.player_id, members.length);
      members.push({
        player: player ? playerRef(player) : null,
        name: player ? displayName(player) : member.name,
        pals: 0
      });
    }
  }
  let savedAt: Date | null = null;
  const note = (at: Date) => {
    if (!savedAt || at > savedAt) savedAt = at;
  };
  const pals: GuildPal[] = [];
  for (const row of palRows) {
    const member = memberIndex.get(row.playerUid);
    if (member === undefined) continue;
    members[member]!.pals += 1;
    pals.push(palOf(row, member));
    note(row.savedAt);
  }
  const eggs: GuildEgg[] = [];
  for (const row of inventoryEggs) {
    const member = memberIndex.get(row.playerUid ?? '');
    if (member === undefined) continue;
    eggs.push(eggOf(row, member, null));
    note(row.savedAt);
  }
  for (const row of baseEggs) {
    eggs.push(eggOf(row, null, baseRefs.get(row.baseId ?? '') ?? null));
    note(row.savedAt);
  }
  const order = members
    .map((member, index) => index)
    .sort(
      (a, b) =>
        members[b]!.pals - members[a]!.pals || members[a]!.name.localeCompare(members[b]!.name)
    );
  const position = new Map(order.map((index, rank) => [index, rank]));
  const renumber = (index: number | null) => (index === null ? null : position.get(index)!);
  for (const pal of pals) pal.member = renumber(pal.member)!;
  for (const egg of eggs) egg.member = renumber(egg.member);
  pals.sort(
    (a, b) =>
      a.member - b.member ||
      placeOrder.indexOf(a.where) - placeOrder.indexOf(b.where) ||
      a.species.localeCompare(b.species) ||
      b.level - a.level ||
      a.id.localeCompare(b.id)
  );
  eggs.sort(
    (a, b) =>
      eggPlaceOrder.indexOf(a.where) - eggPlaceOrder.indexOf(b.where) ||
      (a.member ?? -1) - (b.member ?? -1) ||
      (a.base?.id ?? -1) - (b.base?.id ?? -1) ||
      a.species.localeCompare(b.species) ||
      a.id.localeCompare(b.id)
  );
  return {
    guild: { id: guild.id, name: guild.name },
    saved_at: savedAt ? (savedAt as Date).toISOString() : null,
    members: order.map((index) => members[index]!),
    pals,
    eggs
  };
}
