import type { SiteFeatures } from '$lib/api/types';

export interface NavigationEntry {
  label: string;
  href: string;
  group: 'site' | 'admin';
  needs?: (features: SiteFeatures) => boolean;
}

export const navigation: NavigationEntry[] = [
  { label: 'Today', href: '/', group: 'site' },
  {
    label: 'Map',
    href: '/map',
    group: 'site',
    needs: (features) => features.positions || features.bases
  },
  { label: 'Players', href: '/players', group: 'site' },
  { label: 'Guilds', href: '/guilds', group: 'site' },
  { label: 'Progression', href: '/progression', group: 'site' },
  { label: 'Activity', href: '/activity', group: 'site' },
  { label: 'Chat', href: '/chat', group: 'site', needs: (features) => features.chat },
  { label: 'World', href: '/world', group: 'site' },
  { label: 'Admin', href: '/admin', group: 'admin' }
];

export interface NavigationLink {
  label: string;
  href: string;
  group: 'site' | 'admin';
}

export function navigationFor(features: SiteFeatures | null): NavigationLink[] {
  return navigation
    .filter((entry) => !features || !entry.needs || entry.needs(features))
    .map(({ label, href, group }) => ({ label, href, group }));
}

export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
