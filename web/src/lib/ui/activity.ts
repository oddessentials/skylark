import type {
  ActivityDetails,
  ActivityItem,
  ActivityType,
  GuildRef,
  PlayerRef
} from '$lib/api/types';
import { formatDuration } from './format';

export type ActivityTone = 'neutral' | 'good' | 'bad' | 'warn' | 'info';

export type ActivityPart =
  | { kind: 'text'; text: string }
  | { kind: 'player'; player: PlayerRef }
  | { kind: 'guild'; guild: GuildRef }
  | { kind: 'quote'; text: string };

export interface ActivityView {
  tone: ActivityTone;
  parts: ActivityPart[];
  channel: string | null;
  place: { x: number; y: number } | null;
}

export const activityLabels: Record<ActivityType, string> = {
  'server.online': 'Server up',
  'server.offline': 'Server down',
  'collector.lost': 'Contact lost',
  'player.joined': 'Joined',
  'player.left': 'Left',
  'player.level_up': 'Level up',
  'player.died': 'Knocked out',
  'chat.message': 'Chat',
  'base.established': 'New base',
  'base.removed': 'Base gone',
  'guild.renamed': 'Guild renamed',
  'player.guild_joined': 'Guild change',
  'pal.captured': 'Caught',
  'pal.hatched': 'Hatched',
  'boss.defeated': 'Boss beaten',
  'technology.unlocked': 'Unlocked'
};

export const activityFilters: { label: string; types: ActivityType[] }[] = [
  { label: 'Comings and goings', types: ['player.joined', 'player.left'] },
  { label: 'Progress', types: ['player.level_up', 'technology.unlocked', 'boss.defeated'] },
  { label: 'Pals', types: ['pal.captured', 'pal.hatched'] },
  { label: 'Knockouts', types: ['player.died'] },
  { label: 'Chat', types: ['chat.message'] },
  {
    label: 'Guilds and bases',
    types: ['base.established', 'base.removed', 'guild.renamed', 'player.guild_joined']
  },
  { label: 'Server', types: ['server.online', 'server.offline', 'collector.lost'] }
];

const text = (value: string): ActivityPart => ({ kind: 'text', text: value });

function who(player: PlayerRef | null): ActivityPart {
  return player ? { kind: 'player', player } : text('Someone');
}

function guildPart(guild: GuildRef | null | undefined, fallback: string): ActivityPart {
  return guild ? { kind: 'guild', guild } : text(fallback);
}

function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

function palPhrase(name: string | null | undefined, level: number | null | undefined): string {
  const pal = name ?? 'Pal';
  return withArticle(level ? `level ${level} ${pal}` : pal);
}

const causePhrases: Record<string, string> = {
  falling: 'fell and was knocked out',
  drown: 'drowned',
  burn: 'was knocked out by burns',
  poison: 'was knocked out by poison',
  body_temperature: 'was knocked out by the heat or cold',
  tower_boss_battle: 'was knocked out in a tower battle'
};

export function knockoutPhrase(
  details: Pick<ActivityDetails, 'cause' | 'killer' | 'killer_kind' | 'killer_level'>
): string {
  if (details.killer) {
    const killer =
      details.killer_kind === 'pal'
        ? palPhrase(details.killer, details.killer_level)
        : details.killer;
    return `was knocked out by ${killer}`;
  }
  return causePhrases[details.cause ?? ''] ?? 'was knocked out';
}

function bossPhrase(details: ActivityDetails): string {
  const boss = details.boss_name ?? (details.boss_kind === 'raid' ? 'a raid boss' : 'a tower boss');
  if (details.boss_kind === 'raid') return ` won the raid against ${boss}`;
  return details.difficulty === 'hard' ? ` beat ${boss} on hard` : ` beat ${boss}`;
}

const channelNames: Record<string, string> = {
  global: 'Global',
  guild: 'Guild',
  say: 'Nearby',
  other: 'Other'
};

export function describeActivity(item: ActivityItem): ActivityView {
  const details = item.details;
  const place =
    details.x !== undefined && details.y !== undefined ? { x: details.x, y: details.y } : null;
  const view = (tone: ActivityTone, parts: ActivityPart[], channel: string | null = null) => ({
    tone,
    parts,
    channel,
    place
  });
  switch (item.type) {
    case 'server.online':
      return view('good', [
        text(
          details.version ? `The server came online (${details.version})` : 'The server came online'
        )
      ]);
    case 'server.offline':
      return view('bad', [
        text(
          details.reason === 'shutdown' ? 'The server shut down' : 'The server stopped answering'
        )
      ]);
    case 'collector.lost':
      return view('warn', [text('Lost contact with the server')]);
    case 'player.joined':
      return view('good', [who(item.player), text(' joined the world')]);
    case 'player.left':
      return view('neutral', [
        who(item.player),
        text(
          details.session_s ? ` left after ${formatDuration(details.session_s)}` : ' left the world'
        )
      ]);
    case 'player.level_up':
      return view('info', [who(item.player), text(` reached level ${details.to ?? '?'}`)]);
    case 'player.died':
      return view('bad', [
        who(item.player),
        text(` ${knockoutPhrase(details)}`),
        ...(details.region ? [text(` in ${details.region}`)] : [])
      ]);
    case 'chat.message':
      return view(
        'neutral',
        [who(item.player), text(' '), { kind: 'quote', text: details.text ?? '' }],
        channelNames[details.channel ?? 'other'] ?? 'Other'
      );
    case 'base.established':
      return view('good', [
        guildPart(details.guild, 'A guild'),
        text(
          details.base_name
            ? ` set up a base, ${details.base_name}`
            : details.region
              ? ` set up a base in ${details.region}`
              : ' set up a new base'
        )
      ]);
    case 'base.removed':
      return view('neutral', [
        guildPart(details.guild, 'A guild'),
        text(
          details.base_name
            ? ` packed up ${details.base_name}`
            : details.region
              ? ` packed up their base in ${details.region}`
              : ' packed up a base'
        )
      ]);
    case 'guild.renamed':
      return view('info', [
        text(`${details.old_name ?? 'A guild'} is now `),
        guildPart(details.guild, details.new_name ?? 'renamed')
      ]);
    case 'player.guild_joined':
      return view('info', [
        who(item.player),
        text(' joined '),
        guildPart(details.guild, 'a guild'),
        ...(details.previous_guild
          ? [text(', leaving '), guildPart(details.previous_guild, 'their old guild')]
          : [])
      ]);
    case 'pal.captured':
      return view('good', [
        who(item.player),
        text(` caught ${palPhrase(details.species_name, details.level)}`)
      ]);
    case 'pal.hatched':
      return view('good', [
        who(item.player),
        text(` hatched ${palPhrase(details.species_name, details.level)}`)
      ]);
    case 'boss.defeated':
      return view('good', [who(item.player), text(bossPhrase(details))]);
    case 'technology.unlocked':
      return view('info', [
        who(item.player),
        text(` unlocked ${details.technology_name ?? 'a new technology'}`)
      ]);
    default:
      return view('neutral', [text(item.type)]);
  }
}

export function mergeActivity(live: ActivityItem[], loaded: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];
  for (const item of [...live, ...loaded]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

export function baseLabel(base: { name: string | null; region: string | null }): string {
  if (base.name) return base.name;
  return base.region ? `Base in ${base.region}` : 'Base';
}
