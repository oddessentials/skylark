import { and, asc, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import {
  feats,
  guildSaves,
  playerSaves,
  players,
  sessions,
  type PlayerRow,
  type SavedProgress
} from '../db/schema';
import {
  areasTotal,
  bossTechnologyTotal,
  fastTravelTotal,
  fieldBossList,
  parseTowerKey,
  researchOf,
  researchTotal,
  storyQuestOf,
  storyTotal,
  technologyOf,
  technologyTotal,
  towerList,
  towerOf,
  worldTreeMap,
  type QuestFact
} from '$lib/world/progression';
import {
  displayName,
  guildNames,
  guildRef,
  playerRef,
  secondsBetween,
  type Schemas
} from './common';

export type Progression = Schemas['Progression'];
export type ProgressionPlayer = Schemas['ProgressionPlayer'];
export type ProgressionGuild = Schemas['ProgressionGuild'];
type TowerClear = Schemas['ProgressionTowerClear'];
type Difficulty = TowerClear['difficulty'];

interface Seen {
  towers: Map<string, Date>;
  lastTechnology: { id: string; at: Date } | null;
}

const towerOrder = new Map(towerList.map((tower, index) => [tower.id, index]));
const difficultyOrder: Difficulty[] = ['normal', 'hard'];

function towerFeatKey(tower: string, difficulty: Difficulty): string {
  return `${tower.toLowerCase()}:${difficulty}`;
}

async function seenByPlayer(db: Database, playerIds: number[]): Promise<Map<number, Seen>> {
  const out = new Map<number, Seen>();
  if (playerIds.length === 0) return out;
  const rows = await db
    .select({
      playerId: feats.playerId,
      kind: feats.kind,
      subject: feats.subject,
      detail: feats.detail,
      at: feats.at
    })
    .from(feats)
    .where(and(inArray(feats.playerId, playerIds), inArray(feats.kind, ['boss', 'technology'])))
    .orderBy(asc(feats.at), asc(feats.id));
  for (const row of rows) {
    let seen = out.get(row.playerId);
    if (!seen) {
      seen = { towers: new Map(), lastTechnology: null };
      out.set(row.playerId, seen);
    }
    if (row.kind === 'technology') {
      seen.lastTechnology = { id: row.subject, at: row.at };
      continue;
    }
    const detail = (row.detail ?? '').toLowerCase();
    if (!detail.startsWith('tower')) continue;
    const key = towerFeatKey(row.subject, detail.includes('hard') ? 'hard' : 'normal');
    if (!seen.towers.has(key)) seen.towers.set(key, row.at);
  }
  return out;
}

function firstSeen(seen: Seen | undefined, tower: string, difficulty: Difficulty): string | null {
  const at = seen?.towers.get(towerFeatKey(tower, difficulty));
  return at ? at.toISOString() : null;
}

export function towerClears(progress: SavedProgress, seen?: Seen): TowerClear[] {
  const clears: TowerClear[] = [];
  const covered = new Set<string>();
  for (const [key, count] of Object.entries(progress.tower_defeats ?? {})) {
    const parsed = parseTowerKey(key);
    if (!parsed || count <= 0) continue;
    covered.add(parsed.tower.id);
    clears.push({
      tower: parsed.tower.id,
      difficulty: parsed.difficulty,
      count,
      first_seen_at: firstSeen(seen, parsed.tower.id, parsed.difficulty)
    });
  }
  for (const id of progress.tower_bosses) {
    const tower = towerOf(id);
    if (!tower || covered.has(tower.id)) continue;
    covered.add(tower.id);
    clears.push({
      tower: tower.id,
      difficulty: 'normal',
      count: 1,
      first_seen_at: firstSeen(seen, tower.id, 'normal')
    });
  }
  return clears.sort(
    (a, b) =>
      (towerOrder.get(a.tower) ?? 99) - (towerOrder.get(b.tower) ?? 99) ||
      difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)
  );
}

function questRef(quest: QuestFact): Schemas['ProgressionQuest'] {
  return { id: quest.id, title: quest.title, stage: quest.stage };
}

export function storyOf(progress: SavedProgress): Schemas['ProgressionStory'] {
  const completed = new Map<string, QuestFact>();
  for (const id of progress.completed_quests ?? []) {
    const quest = storyQuestOf(id);
    if (quest) completed.set(quest.id, quest);
  }
  let furthest: QuestFact | null = null;
  for (const quest of completed.values()) {
    if (!furthest || quest.stage > furthest.stage) furthest = quest;
  }
  const current = new Map<string, QuestFact>();
  for (const entry of progress.ordered_quests ?? []) {
    const quest = storyQuestOf(entry.id);
    if (quest && !completed.has(quest.id)) current.set(quest.id, quest);
  }
  return {
    completed: completed.size,
    total: storyTotal,
    stage: furthest ? questRef(furthest) : null,
    current: [...current.values()].sort((a, b) => a.stage - b.stage).map(questRef)
  };
}

function technologyStats(progress: SavedProgress, seen?: Seen): Schemas['ProgressionTechnology'] {
  const ids = progress.technology_ids ?? [];
  const known = ids.map(technologyOf).filter((entry) => entry !== null);
  const last = seen?.lastTechnology ?? null;
  return {
    unlocked: ids.length > 0 ? ids.length : progress.technologies,
    total: technologyTotal,
    tier: known.reduce((best, entry) => Math.max(best, entry.level), 0),
    boss_unlocked: known.filter((entry) => entry.boss).length,
    boss_total: bossTechnologyTotal,
    points: progress.technology_points ?? 0,
    boss_points: progress.boss_technology_points ?? 0,
    last_unlocked: last
      ? { id: last.id, name: technologyOf(last.id)?.name ?? last.id, at: last.at.toISOString() }
      : null
  };
}

async function playtimes(db: Database, rows: PlayerRow[], now: Date): Promise<Map<number, number>> {
  const ids = rows.flatMap((row) =>
    row.online && row.currentSessionId !== null ? [row.currentSessionId] : []
  );
  const open = new Map<number, Date>();
  if (ids.length > 0) {
    for (const session of await db
      .select({ id: sessions.id, joinedAt: sessions.joinedAt })
      .from(sessions)
      .where(inArray(sessions.id, ids))) {
      open.set(session.id, session.joinedAt);
    }
  }
  const out = new Map<number, number>();
  for (const row of rows) {
    const joined = row.currentSessionId !== null ? open.get(row.currentSessionId) : undefined;
    const live = row.online && joined ? secondsBetween(joined, now) : 0;
    out.set(row.id, Math.round(row.playtimeS + live));
  }
  return out;
}

export async function getProgression(db: Database, now = new Date()): Promise<Progression> {
  const saves = (await db.select().from(playerSaves).where(isNull(playerSaves.goneAt))).filter(
    (save) => save.progress !== null
  );
  const known = new Map<string, PlayerRow>();
  if (saves.length > 0) {
    const uids = saves.map((save) => save.playerUid);
    for (const row of await db.select().from(players).where(inArray(players.playerUid, uids))) {
      if (row.playerUid) known.set(row.playerUid, row);
    }
  }
  const rows = [...known.values()];
  const [seen, played] = await Promise.all([
    seenByPlayer(
      db,
      rows.map((row) => row.id)
    ),
    playtimes(db, rows, now)
  ]);
  const labs = (await db.select().from(guildSaves).where(isNull(guildSaves.goneAt))).filter(
    (row) => row.lab !== null
  );
  const names = await guildNames(db, [
    ...saves.map((save) => save.guildId),
    ...rows.map((row) => row.guildId),
    ...labs.map((row) => row.guildId)
  ]);
  let latest: Date | null = null;
  const entries: { player: ProgressionPlayer; bosses: Set<string> }[] = [];
  for (const save of saves) {
    const progress = save.progress!;
    const player = known.get(save.playerUid);
    if (player?.hidden) continue;
    const name = player ? displayName(player) : (save.name ?? '').trim();
    if (!name) continue;
    if (!latest || save.savedAt > latest) latest = save.savedAt;
    const own = player ? seen.get(player.id) : undefined;
    entries.push({
      bosses: new Set((progress.field_boss_keys ?? []).map((key) => key.toLowerCase())),
      player: {
        player: player ? playerRef(player) : null,
        name,
        guild: guildRef(player?.guildId ?? save.guildId, names),
        level: player && player.level > 0 ? player.level : save.level,
        playtime_s: player ? (played.get(player.id) ?? null) : null,
        saved_at: save.savedAt.toISOString(),
        towers: towerClears(progress, own),
        story: storyOf(progress),
        technology: technologyStats(progress, own),
        field_bosses: progress.field_boss_keys?.length ?? progress.field_bosses,
        raids: Object.values(progress.raid_defeats ?? {}).reduce((sum, count) => sum + count, 0),
        fast_travel: progress.fast_travel_keys?.length ?? progress.fast_travel_points,
        areas: progress.area_keys?.length ?? 0,
        world_tree: (progress.world_maps ?? []).some(
          (map) => map.toLowerCase() === worldTreeMap.toLowerCase()
        )
      }
    });
  }
  entries.sort(
    (a, b) =>
      b.player.story.completed - a.player.story.completed ||
      (b.player.level ?? 0) - (a.player.level ?? 0) ||
      a.player.name.localeCompare(b.player.name)
  );
  const fieldBosses = fieldBossList.map((boss) => ({
    ...boss,
    beaten_by: entries.flatMap((entry, index) =>
      entry.bosses.has(boss.spawner.toLowerCase()) ? [index] : []
    )
  }));
  const guilds: ProgressionGuild[] = [];
  for (const row of labs) {
    const lab = row.lab!;
    if (!latest || row.savedAt > latest) latest = row.savedAt;
    const completed: Schemas['ProgressionResearchRef'][] = [];
    for (const entry of lab.research) {
      const fact = researchOf(entry.id);
      if (fact && entry.work >= fact.requiredWork) completed.push({ id: fact.id, name: fact.name });
    }
    completed.sort((a, b) => a.name.localeCompare(b.name));
    let current: Schemas['ProgressionCurrentResearch'] | null = null;
    if (lab.current) {
      const fact = researchOf(lab.current);
      const done = lab.research.find(
        (entry) => entry.id.toLowerCase() === lab.current!.toLowerCase()
      );
      const work = done?.work ?? 0;
      const required = fact?.requiredWork ?? 0;
      current = {
        id: fact?.id ?? lab.current,
        name: fact?.name ?? lab.current,
        work,
        required_work: required,
        share: required > 0 ? Math.min(1, work / required) : 0
      };
    }
    guilds.push({
      guild: { id: row.guildId, name: names.get(row.guildId) ?? row.name },
      saved_at: row.savedAt.toISOString(),
      done: completed.length,
      total: researchTotal,
      current,
      completed
    });
  }
  guilds.sort((a, b) => b.done - a.done || a.guild.name.localeCompare(b.guild.name));
  return {
    saved_at: latest ? (latest as Date).toISOString() : null,
    towers: towerList.map((tower) => ({ ...tower })),
    players: entries.map((entry) => entry.player),
    field_bosses: fieldBosses,
    guilds,
    totals: {
      story: storyTotal,
      technology: technologyTotal,
      boss_technology: bossTechnologyTotal,
      fast_travel: fastTravelTotal,
      areas: areasTotal,
      field_bosses: fieldBossList.length,
      research: researchTotal
    }
  };
}
