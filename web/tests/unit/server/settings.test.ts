import { describe, expect, it } from 'vitest';
import { ApiHttpError } from '$lib/server/http/respond';
import {
  defaultSettings,
  lockedFields,
  parseSettingsUpdate,
  resolveSettings,
  type SettingsEnvironment
} from '$lib/server/settings';

const unset: SettingsEnvironment = { publicSiteName: '' };

function rejection(body: unknown): string {
  try {
    parseSettingsUpdate(body);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).status).toBe(400);
    return (error as ApiHttpError).message;
  }
  throw new Error('the update was accepted');
}

describe('settings updates', () => {
  it('accepts each setting and trims text', () => {
    expect(
      parseSettingsUpdate({ site_name: '  Sunreach ', features: { chat: false, bases: false } })
    ).toEqual({ site_name: 'Sunreach', features: { chat: false, bases: false } });
  });

  it('rejects what it cannot store', () => {
    expect(rejection(null)).toMatch(/JSON object/);
    expect(rejection({ theme: 'dark' })).toMatch(/theme is not a setting/);
    expect(rejection({ site_name: '   ' })).toMatch(/1 to 60 characters/);
    expect(rejection({ site_name: 'x'.repeat(61) })).toMatch(/1 to 60 characters/);
    expect(rejection({ features: { weather: true } })).toMatch(/weather is not a feature/);
    expect(rejection({ features: { chat: 'off' } })).toMatch(/true or false/);
    expect(rejection({ retention: 30 })).toMatch(/retention must be an object/);
    expect(rejection({ retention: { chat_days: 30 } })).toMatch(/not a retention setting/);
    expect(rejection({ retention: { snapshots_hours: 0 } })).toMatch(/from 1 to 168/);
    expect(rejection({ retention: { metrics_days: 2.5 } })).toMatch(/whole number/);
    expect(rejection({ retention: { status_samples_days: null } })).toMatch(/whole number/);
  });

  it('accepts retention periods, and null to keep positions forever', () => {
    expect(parseSettingsUpdate({ retention: { positions_days: 90, metrics_days: 7 } })).toEqual({
      retention: { positions_days: 90, metrics_days: 7 }
    });
    expect(parseSettingsUpdate({ retention: { positions_days: null } })).toEqual({
      retention: { positions_days: null }
    });
  });
});

describe('resolved settings', () => {
  it('falls back to the defaults, with guild chat off', () => {
    expect(resolveSettings({}, unset)).toEqual({ ...defaultSettings, locked: [] });
    expect(defaultSettings.features.guild_chat).toBe(false);
  });

  it('uses stored values and ignores malformed ones', () => {
    expect(
      resolveSettings(
        {
          site_name: 'Sunreach',
          features: { chat: false, pals: 'no' },
          retention: { positions_days: 60, snapshots_hours: 999, metrics_days: 'long' }
        },
        unset
      )
    ).toEqual({
      site_name: 'Sunreach',
      features: { ...defaultSettings.features, chat: false },
      retention: { ...defaultSettings.retention, positions_days: 60 },
      locked: []
    });
    expect(defaultSettings.retention.positions_days).toBeNull();
  });

  it('lets the environment win and marks the name locked', () => {
    const environment: SettingsEnvironment = { publicSiteName: 'From the environment' };
    expect(lockedFields(environment)).toEqual(['site_name']);
    expect(resolveSettings({ site_name: 'Stored' }, environment)).toMatchObject({
      site_name: 'From the environment',
      locked: ['site_name']
    });
  });
});
