import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  guildSaves,
  guilds,
  playerSaves,
  players,
  type PlayerRow,
  type PlayerSaveRow
} from '../db/schema';
import { notFound } from '../http/respond';
import { habitatOf } from '$lib/world/habitats';
import { pals } from '$lib/world/pals.json';
import { displayName, playerRef, type Schemas } from './common';
import { visiblePlayer } from './players';
import { playerSaveOf } from './saves';

export type PlayerPalpedia = Schemas['PlayerPalpedia'];
export type GuildPalpedia = Schemas['GuildPalpedia'];

const catalogue = pals.map((entry) => {
  const habitat = habitatOf(entry.id);
  return {
    id: entry.id,
    key: entry.id.toLowerCase(),
    ways: habitat?.ways ?? [],
    nightOnly: habitat?.nightOnly ?? false,
    levels: habitat?.levels ?? null
  };
});

interface Records {
  caught: Set<string>;
  captures: Map<string, number>;
  savedAt: Date;
}

function recordsOf(row: PlayerSaveRow | null | undefined): Records | null {
  if (!row || row.goneAt || !row.progress?.palpedia_entries) return null;
  const caught = new Set(row.progress.palpedia_entries.map((id) => id.toLowerCase()));
  const captures = new Map<string, number>();
  for (const [id, count] of Object.entries(row.progress.species_captures ?? {})) {
    captures.set(id.toLowerCase(), count);
  }
  return { caught, captures, savedAt: row.savedAt };
}

function unlockedIn(records: Records): number {
  return catalogue.filter((species) => records.caught.has(species.key)).length;
}

export async function getPlayerPalpedia(db: Database, id: number): Promise<PlayerPalpedia> {
  const row = await visiblePlayer(db, id);
  const records = recordsOf(await playerSaveOf(db, row.playerUid));
  const entries = catalogue.map((species) => ({
    species: species.id,
    caught: records?.caught.has(species.key) ?? false,
    captures: records?.captures.get(species.key) ?? 0,
    ways: species.ways,
    night_only: species.nightOnly,
    levels: species.levels
  }));
  return {
    player: playerRef(row),
    saved_at: records ? records.savedAt.toISOString() : null,
    unlocked: records ? unlockedIn(records) : 0,
    total: catalogue.length,
    entries
  };
}

export async function getGuildPalpedia(db: Database, id: string): Promise<GuildPalpedia> {
  const found = await db.select().from(guilds).where(eq(guilds.id, id)).limit(1);
  const guild = found[0];
  if (!guild) throw notFound(`guild ${id} does not exist`);
  const rosters = await db
    .select()
    .from(guildSaves)
    .where(and(eq(guildSaves.guildId, id), isNull(guildSaves.goneAt)))
    .limit(1);
  const roster = rosters[0];
  const members: GuildPalpedia['members'] = [];
  const records: (Records | null)[] = [];
  let savedAt: Date | null = null;
  if (roster) {
    const uids = roster.members.map((member) => member.player_id);
    const known = new Map<string, PlayerRow>();
    const saved = new Map<string, PlayerSaveRow>();
    if (uids.length > 0) {
      for (const player of await db
        .select()
        .from(players)
        .where(inArray(players.playerUid, uids))) {
        if (player.playerUid) known.set(player.playerUid, player);
      }
      for (const save of await db
        .select()
        .from(playerSaves)
        .where(inArray(playerSaves.playerUid, uids))) {
        saved.set(save.playerUid, save);
      }
    }
    for (const member of roster.members) {
      const player = known.get(member.player_id);
      if (player?.hidden) continue;
      const own = recordsOf(saved.get(member.player_id));
      members.push({
        player: player ? playerRef(player) : null,
        name: player ? displayName(player) : member.name,
        unlocked: own ? unlockedIn(own) : 0
      });
      records.push(own);
      if (own && (!savedAt || own.savedAt > savedAt)) savedAt = own.savedAt;
    }
  }
  const order = members
    .map((member, index) => index)
    .sort(
      (a, b) =>
        members[b]!.unlocked - members[a]!.unlocked ||
        members[a]!.name.localeCompare(members[b]!.name)
    );
  const sortedMembers = order.map((index) => members[index]!);
  const sortedRecords = order.map((index) => records[index] ?? null);
  const entries = catalogue.map((species) => {
    const holders: number[] = [];
    let captures = 0;
    sortedRecords.forEach((own, index) => {
      if (!own) return;
      if (own.caught.has(species.key)) holders.push(index);
      captures += own.captures.get(species.key) ?? 0;
    });
    return {
      species: species.id,
      caught: holders.length > 0,
      captures,
      holders,
      ways: species.ways,
      night_only: species.nightOnly,
      levels: species.levels
    };
  });
  return {
    guild: { id: guild.id, name: guild.name },
    saved_at: savedAt ? savedAt.toISOString() : null,
    unlocked: entries.filter((entry) => entry.caught).length,
    total: catalogue.length,
    members: sortedMembers,
    entries
  };
}
