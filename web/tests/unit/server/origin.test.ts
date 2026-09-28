import { describe, expect, it } from 'vitest';
import { fromThisSite, isSecureSite } from '$lib/server/auth/admin';

function event(url: string, origin?: string) {
  return {
    url: new URL(url),
    request: new Request(url, { headers: origin ? { origin } : {} })
  };
}

describe('admin requests without ORIGIN', () => {
  it('come from this site when the Origin host is the address the request reached', () => {
    const request = event('https://guild.example.com/api/v1/admin/settings');
    expect(fromThisSite('https://guild.example.com', request, '')).toBe(true);
    expect(fromThisSite('http://guild.example.com', request, '')).toBe(true);
    expect(fromThisSite('https://evil.example.net', request, '')).toBe(false);
    expect(fromThisSite('https://guild.example.com:8443', request, '')).toBe(false);
    expect(fromThisSite('not a url', request, '')).toBe(false);
  });

  it('set a Secure cookie only when the browser is on https', () => {
    expect(isSecureSite(event('https://guild.example.com/', 'https://guild.example.com'), '')).toBe(
      true
    );
    expect(isSecureSite(event('https://192.168.1.20:3000/', 'http://192.168.1.20:3000'), '')).toBe(
      false
    );
    expect(isSecureSite(event('https://guild.example.com/'), '')).toBe(true);
    expect(isSecureSite(event('http://localhost:3000/'), '')).toBe(false);
  });
});

describe('admin requests with ORIGIN', () => {
  it('must match it exactly and follow its scheme', () => {
    const request = event('https://guild.example.com/', 'https://guild.example.com');
    expect(fromThisSite('https://guild.example.com', request, 'https://guild.example.com')).toBe(
      true
    );
    expect(fromThisSite('http://guild.example.com', request, 'https://guild.example.com')).toBe(
      false
    );
    expect(isSecureSite(request, 'http://localhost:3000')).toBe(false);
  });
});
