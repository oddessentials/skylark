import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { CollectorEvent, IngestBatch, ServerInfo } from '../../src/lib/api/types.ts';

interface PalClass {
  species?: string;
  name?: string;
  roles?: string[];
  is_boss?: boolean;
}

interface Landmark {
  id: string;
  name: string;
  position: [number, number, number];
  map: string;
}

function readWorld<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../src/lib/world/${name}.json`, import.meta.url), 'utf8')
  ) as T;
}

export interface SimulatedPlayer {
  userId: string;
  playerUid: string;
  instanceId: string;
  name: string;
  accountName: string;
  guild: number;
  appetite: number;
  startHour: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface SimulatedGuild {
  id: string;
  name: string;
  firstName: string;
}

export interface GeneratorOptions {
  seed?: number;
  days?: number;
  endAt?: Date;
  stepS?: number;
  idleStepS?: number;
  tailMinutes?: number;
  tailStepS?: number;
}

export interface SimulatedRun {
  runId: string;
  startedAt: Date;
}

export interface SimulatedHistory {
  events: CollectorEvent[];
  runs: SimulatedRun[];
  players: SimulatedPlayer[];
  guilds: SimulatedGuild[];
  server: ServerInfo;
  endAt: Date;
  onlineAtEnd: SimulatedPlayer[];
}

export const serverInfo: ServerInfo = {
  version: 'v1.0.5.102999',
  name: 'Skylark Test Server',
  description: 'A simulated Palworld world for Skylark development.',
  world_guid: '5EA2B1C94F0A4E3D8C7B6A5F4E3D2C1B'
};

export const serverSettings = {
  day_time_speed_rate: 1,
  night_time_speed_rate: 1,
  server_player_max_num: 32,
  is_pvp: false,
  is_hardcore: false,
  exp_rate: 1.5,
  pal_capture_rate: 1.2,
  death_penalty: 'Item',
  guild_player_max_num: 20,
  base_camp_max_num_in_guild: 4
};

export const collectorName = 'skylark-collector';
export const collectorVersion = '0.1.0';
export const inGameMinutesPerRealMinute = 45;
export const deathAction = 'BP_ActionDeath';

const cast: Omit<SimulatedPlayer, 'userId' | 'playerUid' | 'instanceId'>[] = [
  {
    name: 'Wren',
    accountName: 'wrenfield',
    guild: 0,
    appetite: 0.9,
    startHour: 18,
    minMinutes: 60,
    maxMinutes: 180
  },
  {
    name: 'Tamsin',
    accountName: 'tamsin.plays',
    guild: 0,
    appetite: 0.75,
    startHour: 19,
    minMinutes: 45,
    maxMinutes: 150
  },
  {
    name: 'Orrin',
    accountName: 'orrin_b',
    guild: 0,
    appetite: 0.6,
    startHour: 20,
    minMinutes: 30,
    maxMinutes: 120
  },
  {
    name: 'Juniper',
    accountName: 'juniper-sky',
    guild: 1,
    appetite: 0.8,
    startHour: 17,
    minMinutes: 60,
    maxMinutes: 200
  },
  {
    name: 'Kestrel',
    accountName: 'kestrel_k',
    guild: 1,
    appetite: 0.55,
    startHour: 21,
    minMinutes: 30,
    maxMinutes: 100
  },
  {
    name: 'Bramble',
    accountName: 'bramblebee',
    guild: 1,
    appetite: 0.5,
    startHour: 16,
    minMinutes: 40,
    maxMinutes: 140
  },
  {
    name: 'Sable',
    accountName: 'sable.night',
    guild: 2,
    appetite: 0.65,
    startHour: 22,
    minMinutes: 45,
    maxMinutes: 160
  },
  {
    name: 'Mossbrook',
    accountName: 'mossbrook',
    guild: 2,
    appetite: 0.45,
    startHour: 15,
    minMinutes: 30,
    maxMinutes: 90
  }
];

const platformIds = [
  'steam_76561190000000001',
  'steam_76561190000000002',
  'gdk_9000000000000003',
  'steam_76561190000000004',
  'ps5_9000000000000005',
  'steam_76561190000000006',
  'steam_76561190000000007',
  'gdk_9000000000000008'
];

const guildNames = [
  { first: 'Sunreach Wayfarers', last: 'Sunreach Wayfarers' },
  { first: 'Moss and Ember', last: 'Moss and Ember' },
  { first: 'Unnamed Guild', last: 'Night Market' }
];

const chatLines = [
  'anyone up for the tower tonight?',
  'found a great ore spot past the eagle statue',
  'heading back to base',
  'who left the furnace running',
  'brb',
  'gg',
  'the wind here is wild',
  'need more paldium, trade?',
  'just hatched something cute',
  'meet at the statue',
  'night is falling, stay close',
  'lol',
  'got a new saddle finally'
];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuidFrom(random: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hex(text: string, length: number): string {
  return createHash('sha256').update(text).digest('hex').slice(0, length).toUpperCase();
}

export function playerUidOf(userId: string): string {
  let head = hex(userId, 8);
  if (head.startsWith('0')) head = `A${head.slice(1)}`;
  return `${head}${'0'.repeat(24)}`;
}

function palInstance(seed: string): string {
  const h = hex(seed, 32);
  return `${'0'.repeat(32)} : ${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Interval {
  from: number;
  to: number;
}

interface PalState {
  instanceId: string;
  className: string;
  name: string;
  level: number;
}

interface PlayerState {
  player: SimulatedPlayer;
  sessions: Interval[];
  level: number;
  xp: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  heading: number;
  mode: 'home' | 'explore';
  target: [number, number] | null;
  party: PalState[];
  guildId: string;
  switchGuildAt: number | null;
  switchTo: number | null;
  dead: boolean;
  online: boolean;
}

interface BaseState {
  key: string;
  guild: number;
  name: string;
  x: number;
  y: number;
  z: number;
  createdAt: number;
  removedAt: number | null;
  workers: PalState[];
}

const mainMap = { minX: -1_099_400, maxX: 349_400, minY: -724_400, maxY: 724_400 };

function maxHpOf(level: number): number {
  return 500 + level * 25;
}

function xpForNext(level: number): number {
  return 60 + level * level * 6;
}

function inGameClock(worldStartMs: number, atMs: number): { time: string; day: number } {
  const minutes =
    Math.floor(((atMs - worldStartMs) / 60_000) * inGameMinutesPerRealMinute) + 5 * 60;
  const day = Math.floor(minutes / 1440);
  const ofDay = minutes % 1440;
  const hh = String(Math.floor(ofDay / 60)).padStart(2, '0');
  const mm = String(ofDay % 60).padStart(2, '0');
  return { time: `${hh}:${mm}`, day };
}

export function generateHistory(options: GeneratorOptions = {}): SimulatedHistory {
  const seed = options.seed ?? 20260927;
  const days = options.days ?? 7;
  const stepS = options.stepS ?? 120;
  const idleStepS = options.idleStepS ?? 900;
  const tailMinutes = options.tailMinutes ?? 15;
  const tailStepS = options.tailStepS ?? 10;
  const random = mulberry32(seed);
  const endMs = Math.floor((options.endAt ?? new Date()).getTime() / 1000) * 1000;
  const startMs = endMs - days * 86_400_000;
  const worldStartMs = startMs - 3 * 86_400_000;
  const tailFromMs = endMs - tailMinutes * 60_000;

  const classes = readWorld<{ classes: Record<string, PalClass> }>('pals').classes;
  const pool = Object.entries(classes)
    .filter(
      ([className, entry]) =>
        entry.species &&
        entry.name &&
        entry.roles?.includes('normal') &&
        !entry.is_boss &&
        /^BP_[A-Za-z]+_C$/.test(className)
    )
    .map(([className, entry]) => ({ className, name: entry.name as string }))
    .sort((a, b) => a.className.localeCompare(b.className));
  const landmarks = readWorld<{ fast_travel: Landmark[] }>('landmarks').fast_travel.filter(
    (entry) => entry.map === 'MainMap'
  );
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;

  const guilds: SimulatedGuild[] = guildNames.map((names, index) => ({
    id: hex(`guild-${seed}-${index}`, 32),
    name: names.last,
    firstName: names.first
  }));
  const players: SimulatedPlayer[] = cast.map((entry, index) => {
    const userId = platformIds[index]!;
    const uid = playerUidOf(userId);
    return {
      ...entry,
      userId,
      playerUid: uid,
      instanceId: `${uid} : ${hex(`instance-${userId}`, 32)}`
    };
  });

  const homes = guilds.map((_, index) => landmarks[(index * 37 + 11) % landmarks.length]!);
  const bases: BaseState[] = [];
  const addBase = (guild: number, at: number, anchor: Landmark, offset: number) => {
    const x = anchor.position[0] + 2500 + offset * 900;
    const y = anchor.position[1] - 1800 + offset * 700;
    bases.push({
      key: `${guild}-${bases.length}`,
      guild,
      name: `${guilds[guild]!.name.split(' ')[0]} Camp ${offset + 1}`,
      x,
      y,
      z: anchor.position[2] + 150,
      createdAt: at,
      removedAt: null,
      workers: []
    });
  };
  guilds.forEach((_, index) => addBase(index, startMs - 86_400_000, homes[index]!, 0));

  const downtimes: Interval[] = [];
  for (let day = 1; day < days; day++) {
    if (day % 3 !== 0) continue;
    const from = startMs + day * 86_400_000 + 5 * 3_600_000;
    if (from < tailFromMs) downtimes.push({ from, to: from + 3 * 60_000 });
  }
  const collectorRestartMs =
    startMs + Math.floor(days / 2) * 86_400_000 + 14 * 3_600_000 + 17 * 60_000;
  const collectorGap: Interval = { from: collectorRestartMs, to: collectorRestartMs + 20_000 };
  const serverDown = (ms: number) => downtimes.some((gap) => ms >= gap.from && ms < gap.to);

  const states: PlayerState[] = players.map((player, index) => {
    const sessions: Interval[] = [];
    for (let day = 0; day < days; day++) {
      const dayStart = startMs + day * 86_400_000;
      const plays = random() < player.appetite;
      const forced = day === days - 1 && index < 4;
      if (!plays && !forced) continue;
      let from = dayStart + (player.startHour + (random() * 3 - 1.5)) * 3_600_000;
      let to =
        from + (player.minMinutes + random() * (player.maxMinutes - player.minMinutes)) * 60_000;
      if (forced) {
        from = endMs - (40 + index * 17) * 60_000;
        to = endMs + 3_600_000;
      }
      for (const gap of downtimes) {
        if (from < gap.from && to > gap.from) to = gap.from - 30_000;
        if (from >= gap.from && from < gap.to) from = gap.to + 60_000;
      }
      from = Math.max(from, startMs + 60_000);
      if (to - from < 10 * 60_000) continue;
      if (from >= endMs) continue;
      sessions.push({ from: Math.round(from / 1000) * 1000, to: Math.round(to / 1000) * 1000 });
    }
    sessions.sort((a, b) => a.from - b.from);
    const merged: Interval[] = [];
    for (const session of sessions) {
      const last = merged[merged.length - 1];
      if (last && session.from <= last.to + 5 * 60_000) last.to = Math.max(last.to, session.to);
      else merged.push({ ...session });
    }
    const home = homes[player.guild]!;
    const party: PalState[] = [pick(pool), pick(pool)].map((entry, slot) => ({
      instanceId: palInstance(`party-${player.userId}-${slot}`),
      className: entry.className,
      name: entry.name,
      level: 2 + slot
    }));
    return {
      player,
      sessions: merged,
      level: 3 + Math.floor(random() * 6),
      xp: 0,
      x: home.position[0] + (random() - 0.5) * 4000,
      y: home.position[1] + (random() - 0.5) * 4000,
      z: home.position[2],
      hp: maxHpOf(1),
      heading: random() * Math.PI * 2,
      mode: 'home',
      target: null,
      party,
      guildId: guilds[player.guild]!.id,
      switchGuildAt: index === 5 ? startMs + Math.floor(days * 0.6) * 86_400_000 : null,
      switchTo: index === 5 ? 2 : null,
      dead: false,
      online: false
    };
  });
  for (const state of states) state.hp = maxHpOf(state.level);

  const extraBaseAt = startMs + Math.floor(days * 0.4) * 86_400_000 + 20 * 3_600_000;
  addBase(1, extraBaseAt, landmarks[(5 * 13 + 3) % landmarks.length]!, 1);
  const removedBase = bases[bases.length - 1]!;
  removedBase.removedAt = startMs + Math.floor(days * 0.8) * 86_400_000 + 21 * 3_600_000;
  addBase(0, startMs + Math.floor(days * 0.7) * 86_400_000 + 19 * 3_600_000, homes[0]!, 1);
  for (const base of bases) {
    base.workers = [0, 1, 2].map((slot) => {
      const entry = pick(pool);
      return {
        instanceId: palInstance(`worker-${base.key}-${slot}`),
        className: entry.className,
        name: entry.name,
        level: 5 + slot * 3
      };
    });
  }
  const renameAt = startMs + Math.floor(days * 0.3) * 86_400_000 + 22 * 3_600_000;

  const events: CollectorEvent[] = [];
  const runs: SimulatedRun[] = [];
  let runId = '';
  let seq = 0;
  const push = (ms: number, type: string, data: Record<string, unknown>) => {
    events.push({
      id: uuidFrom(random),
      seq: seq++,
      run_id: runId,
      ts: new Date(ms).toISOString(),
      type,
      data
    } as CollectorEvent);
  };
  const startRun = (ms: number) => {
    runId = uuidFrom(random);
    seq = 0;
    runs.push({ runId, startedAt: new Date(ms) });
    push(ms, 'collector.started', {
      collector_version: collectorVersion,
      os: 'linux',
      arch: 'amd64',
      layers: {
        rest: true,
        gamedata: true,
        logs: true,
        logs_source: 'docker',
        saves: false,
        mod: false
      },
      server: serverInfo,
      settings: serverSettings
    });
    push(ms + 500, 'server.online', { ...serverInfo });
  };

  let serverStartMs = startMs;
  let lastMetricsMs = -Infinity;
  let lastHeartbeatMs = -Infinity;
  let collectorUp = true;
  let serverUp = true;
  startRun(startMs);

  const timeline: number[] = [];
  const logTimes = new Set<number>();
  for (const state of states) {
    for (const session of state.sessions) {
      logTimes.add(session.from - 12_000);
      logTimes.add(session.from);
      if (session.to <= endMs) logTimes.add(session.to);
    }
  }
  for (const gap of downtimes) {
    logTimes.add(gap.from);
    logTimes.add(gap.to);
  }
  logTimes.add(collectorGap.from);
  logTimes.add(collectorGap.to);
  let cursor = startMs + 1000;
  while (cursor <= endMs) {
    timeline.push(cursor);
    const anyone = states.some((state) =>
      state.sessions.some((session) => cursor >= session.from && cursor < session.to)
    );
    const step = cursor >= tailFromMs ? tailStepS : anyone ? stepS : idleStepS;
    cursor += step * 1000;
  }
  const moments = [...new Set([...timeline, ...logTimes])]
    .filter((ms) => ms > startMs && ms <= endMs)
    .sort((a, b) => a - b);
  const snapshotMoments = new Set(timeline);

  const chatBudget = new Map<string, number>();

  for (const ms of moments) {
    if (ms === collectorGap.from) {
      push(ms, 'server.offline', { reason: 'collector_stopping' });
      collectorUp = false;
      continue;
    }
    if (ms === collectorGap.to) {
      collectorUp = true;
      startRun(ms);
      continue;
    }
    const gapStart = downtimes.find((gap) => gap.from === ms);
    if (gapStart) {
      if (collectorUp) push(ms, 'server.offline', { reason: 'shutdown' });
      serverUp = false;
      for (const state of states) state.online = false;
      continue;
    }
    const gapEnd = downtimes.find((gap) => gap.to === ms);
    if (gapEnd) {
      serverUp = true;
      serverStartMs = ms;
      if (collectorUp) push(ms, 'server.online', { ...serverInfo });
      continue;
    }
    for (const state of states) {
      const { player } = state;
      const session = state.sessions.find((entry) => ms >= entry.from && ms < entry.to);
      const connecting = state.sessions.some((entry) => entry.from - 12_000 === ms);
      const logging = collectorUp && serverUp && !serverDown(ms);
      if (connecting && logging) {
        push(ms, 'player.connected', { user_id: player.userId, name: player.name });
      }
      const nowOnline = serverUp && !serverDown(ms) && session !== undefined;
      if (!state.online && nowOnline) {
        state.online = true;
        state.mode = 'home';
        state.hp = maxHpOf(state.level);
        chatBudget.set(player.userId, Math.floor(random() * 5));
        if (logging && session.from === ms) {
          push(ms, 'player.joined', {
            user_id: player.userId,
            player_id: player.playerUid,
            name: player.name,
            source: 'log'
          });
        }
      } else if (state.online && !nowOnline) {
        state.online = false;
        if (logging) {
          push(ms, 'player.left', {
            user_id: player.userId,
            player_id: player.playerUid,
            name: player.name,
            source: 'log'
          });
        }
      }
    }
    if (!collectorUp || !serverUp || serverDown(ms)) continue;

    if (!snapshotMoments.has(ms)) continue;
    const tail = ms >= tailFromMs;
    const dtS = tail ? tailStepS : stepS;
    const online = states.filter((state) => state.online);

    for (const state of online) {
      const { player } = state;
      if (state.switchGuildAt !== null && ms >= state.switchGuildAt && state.switchTo !== null) {
        state.guildId = guilds[state.switchTo]!.id;
        state.switchGuildAt = null;
      }
      if (state.dead) {
        state.dead = false;
        state.hp = maxHpOf(state.level);
        const home = homes[player.guild]!;
        state.x = home.position[0] + 1200;
        state.y = home.position[1] - 900;
        state.z = home.position[2];
        state.mode = 'home';
      } else {
        if (random() < (tail ? 0.02 : 0.15)) {
          state.mode = state.mode === 'home' ? 'explore' : random() < 0.4 ? 'home' : 'explore';
          state.target =
            state.mode === 'explore'
              ? (pick(landmarks).position.slice(0, 2) as [number, number])
              : null;
        }
        if (state.mode === 'explore' && random() < (tail ? 0.002 : 0.03)) {
          const hop = pick(landmarks);
          state.x = hop.position[0] + 800;
          state.y = hop.position[1] + 800;
          state.z = hop.position[2];
          state.target = pick(landmarks).position.slice(0, 2) as [number, number];
        } else {
          const home = homes[player.guild]!;
          const goal =
            state.mode === 'explore' && state.target
              ? state.target
              : ([home.position[0], home.position[1]] as [number, number]);
          const toward = Math.atan2(goal[1] - state.y, goal[0] - state.x);
          const far = Math.hypot(goal[0] - state.x, goal[1] - state.y);
          state.heading =
            far > 5000 ? toward + (random() - 0.5) * 0.8 : state.heading + (random() - 0.5) * 1.6;
          const speed =
            (state.mode === 'explore' ? 600 + random() * 700 : 150 + random() * 250) * dtS;
          const travel = state.mode === 'explore' ? Math.min(speed, far) : speed * 0.3;
          state.x = clamp(
            state.x + Math.cos(state.heading) * travel,
            mainMap.minX + 5000,
            mainMap.maxX - 5000
          );
          state.y = clamp(
            state.y + Math.sin(state.heading) * travel,
            mainMap.minY + 5000,
            mainMap.maxY - 5000
          );
          state.z = clamp(state.z + (random() - 0.5) * 200, -2000, 40_000);
          if (state.mode === 'explore' && far < 3000)
            state.target = pick(landmarks).position.slice(0, 2) as [number, number];
        }
        const before = state.level;
        state.xp += dtS * (state.mode === 'explore' ? 1.4 : 0.6) * (0.6 + random());
        while (state.level < 80 && state.xp >= xpForNext(state.level)) {
          state.xp -= xpForNext(state.level);
          state.level += 1;
        }
        if (state.level > before) {
          push(ms - 1, 'player.level_up', {
            user_id: player.userId,
            player_id: player.playerUid,
            name: player.name,
            from: before,
            to: state.level
          });
          if (random() < 0.5) {
            const entry = pick(pool);
            state.party[random() < 0.5 ? 0 : 1] = {
              instanceId: palInstance(`caught-${player.userId}-${ms}`),
              className: entry.className,
              name: entry.name,
              level: Math.max(1, state.level - 3)
            };
          }
        }
        const deathChance = (dtS / 3600) * 0.25;
        if (!tail && random() < deathChance) {
          state.dead = true;
          state.hp = 0;
          push(ms - 1, 'player.died', {
            user_id: player.userId,
            player_id: player.playerUid,
            name: player.name,
            x: state.x,
            y: state.y,
            z: state.z,
            source: 'snapshot',
            cause: null,
            killer: null
          });
        } else {
          state.hp = clamp(state.hp + (random() - 0.45) * 120, 40, maxHpOf(state.level));
        }
      }
      const budget = chatBudget.get(player.userId) ?? 0;
      if (budget > 0 && random() < (tail ? 0.01 : 0.12)) {
        chatBudget.set(player.userId, budget - 1);
        const roll = random();
        const channel = roll < 0.7 ? 'Global' : roll < 0.9 ? 'Guild' : 'Say';
        const guild = guilds.find((entry) => entry.id === state.guildId)!;
        push(ms - 1, 'chat.message', {
          user_id: player.userId,
          name: player.name,
          channel,
          text: pick(chatLines),
          guild_name: channel === 'Guild' ? (ms < renameAt ? guild.firstName : guild.name) : null
        });
      }
    }

    const guildNameAt = (index: number) =>
      ms < renameAt ? guilds[index]!.firstName : guilds[index]!.name;
    const guildIndexOf = (id: string) => guilds.findIndex((entry) => entry.id === id);
    const standing = bases.filter(
      (base) => base.createdAt <= ms && (base.removedAt === null || ms < base.removedAt)
    );
    const palboxes = standing.map((base) => {
      const fresh = ms - base.createdAt < dtS * 1000;
      return {
        guild_id: fresh ? null : guilds[base.guild]!.id,
        guild_name: fresh ? null : guildNameAt(base.guild),
        name: fresh ? null : base.name,
        class: 'BP_BuildObject_PalBoxV2_C',
        x: base.x,
        y: base.y,
        z: base.z
      };
    });
    const pals: Record<string, unknown>[] = [];
    const wild: Record<string, unknown>[] = [];
    for (const state of online) {
      const guildIndex = guildIndexOf(state.guildId);
      if (!state.dead) {
        state.party.forEach((pal, slot) => {
          if (random() < 0.35) return;
          pals.push({
            instance_id: pal.instanceId,
            kind: 'party',
            class: pal.className,
            name: pal.name,
            level: pal.level,
            hp: 300 + pal.level * 20,
            max_hp: 300 + pal.level * 20,
            owner_instance_id: state.player.instanceId,
            owner_player_id: state.player.playerUid,
            owner_name: state.player.name,
            guild_id: state.guildId,
            action: null,
            x: state.x + 150 + slot * 90,
            y: state.y - 120,
            z: state.z
          });
        });
      }
      const wildCount = 4 + Math.floor(random() * 8);
      for (let index = 0; index < wildCount; index++) {
        const entry = pick(pool);
        wild.push({
          class: entry.className,
          name: entry.name,
          level: clamp(state.level + Math.floor(random() * 7) - 3, 1, 80),
          x: state.x + (random() - 0.5) * 12_000,
          y: state.y + (random() - 0.5) * 12_000
        });
      }
      for (const base of standing) {
        if (base.guild !== guildIndex) continue;
        if (Math.hypot(base.x - state.x, base.y - state.y) > 15_000) continue;
        for (const worker of base.workers) {
          if (pals.some((pal) => pal.instance_id === worker.instanceId)) continue;
          pals.push({
            instance_id: worker.instanceId,
            kind: 'base',
            class: worker.className,
            name: worker.name,
            level: worker.level,
            hp: 400,
            max_hp: 400,
            owner_instance_id: null,
            owner_player_id: null,
            owner_name: null,
            guild_id: guilds[base.guild]!.id,
            action: 'BP_AIAction_Worker_Working',
            x: base.x + (random() - 0.5) * 2000,
            y: base.y + (random() - 0.5) * 2000,
            z: base.z
          });
        }
      }
    }
    const clock = inGameClock(worldStartMs, ms);
    push(ms, 'world.snapshot', {
      source: 'gamedata',
      in_game_time: clock.time,
      in_game_day: clock.day,
      players: online.map((state) => {
        const guildIndex = guildIndexOf(state.guildId);
        return {
          user_id: state.player.userId,
          player_id: state.player.playerUid,
          name: state.player.name,
          account_name: state.player.accountName,
          level: state.level,
          ping: 20 + Math.round(random() * 60),
          x: Math.round(state.x * 100) / 100,
          y: Math.round(state.y * 100) / 100,
          z: Math.round(state.z * 100) / 100,
          hp: Math.round(state.hp),
          max_hp: maxHpOf(state.level),
          guild_id: state.guildId,
          guild_name: guildNameAt(guildIndex),
          action: state.dead ? deathAction : null,
          instance_id: state.player.instanceId
        };
      }),
      pals,
      palboxes,
      wild
    });
    const metricsEvery = tail ? 30_000 : 300_000;
    if (ms - lastMetricsMs >= metricsEvery) {
      lastMetricsMs = ms;
      const fps = Math.round((60 - online.length * 0.6 - random() * 2) * 100) / 100;
      push(ms + 1, 'server.metrics', {
        fps,
        fps_avg: Math.round((fps + 0.8) * 100) / 100,
        frame_time_ms: Math.round((1000 / fps) * 100) / 100,
        players: online.length,
        max_players: serverSettings.server_player_max_num,
        days: clock.day,
        base_camps: standing.length,
        uptime_s: Math.round((ms - serverStartMs) / 1000)
      });
    }
    const heartbeatEvery = tail ? 60_000 : 300_000;
    if (ms - lastHeartbeatMs >= heartbeatEvery) {
      lastHeartbeatMs = ms;
      push(ms + 2, 'collector.heartbeat', {
        uptime_s: Math.round((ms - runs[runs.length - 1]!.startedAt.getTime()) / 1000),
        queue_depth: 0,
        dropped_events: 0,
        rest: 'ok',
        gamedata: 'ok',
        logs: 'ok'
      });
    }
  }

  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => Date.parse(a.event.ts) - Date.parse(b.event.ts) || a.index - b.index)
    .map((entry) => entry.event);
  const counters = new Map<string, number>();
  for (const event of ordered) {
    const next = counters.get(event.run_id) ?? 0;
    event.seq = next;
    counters.set(event.run_id, next + 1);
  }
  return {
    events: ordered,
    runs,
    players,
    guilds,
    server: serverInfo,
    endAt: new Date(endMs),
    onlineAtEnd: states.filter((state) => state.online).map((state) => state.player)
  };
}

export const maxBatchEvents = 500;
export const maxBatchBytes = 480 * 1024;

export function toBatches(history: SimulatedHistory): IngestBatch[] {
  const batches: IngestBatch[] = [];
  let current: IngestBatch | null = null;
  let bytes = 0;
  for (const event of history.events) {
    const size = JSON.stringify(event).length + 1;
    if (
      !current ||
      current.collector.run_id !== event.run_id ||
      current.events.length >= maxBatchEvents ||
      bytes + size > maxBatchBytes
    ) {
      current = {
        collector: {
          name: collectorName,
          version: collectorVersion,
          run_id: event.run_id,
          os: 'linux',
          arch: 'amd64'
        },
        server: history.server,
        events: []
      };
      batches.push(current);
      bytes = 600;
    }
    current.events.push(event);
    bytes += size;
  }
  return batches;
}
