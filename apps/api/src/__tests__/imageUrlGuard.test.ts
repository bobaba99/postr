import { describe, it, expect } from 'vitest';
import { checkImageUrl } from '../imageUrlGuard.js';

const SUPABASE_URL = 'https://testref.supabase.co';

function reasonOf(
  imageUrl: string,
  supabaseUrl: string | undefined = SUPABASE_URL,
): string {
  const result = checkImageUrl(imageUrl, supabaseUrl);
  return result.ok ? 'ok' : result.reason;
}

describe('checkImageUrl', () => {
  it('accepts storage URLs on the configured Supabase host', () => {
    expect(
      reasonOf(
        'https://testref.supabase.co/storage/v1/object/sign/posters/page-1.png?token=abc',
      ),
    ).toBe('ok');
    expect(
      reasonOf(
        'https://testref.supabase.co/storage/v1/object/public/posters/page-1.png',
      ),
    ).toBe('ok');
  });

  it('accepts the allowed host regardless of letter case', () => {
    expect(
      reasonOf('https://TESTREF.SUPABASE.CO/storage/v1/object/public/p.png'),
    ).toBe('ok');
  });

  it('rejects the cloud metadata endpoint', () => {
    expect(reasonOf('http://169.254.169.254/latest/meta-data/')).toBe(
      'not_https',
    );
    expect(reasonOf('https://169.254.169.254/latest/meta-data/')).toBe(
      'host_not_allowed',
    );
  });

  it('rejects localhost and loopback addresses', () => {
    expect(reasonOf('http://127.0.0.1:8080/internal-admin')).toBe('not_https');
    expect(reasonOf('https://127.0.0.1/internal-admin')).toBe(
      'host_not_allowed',
    );
    expect(reasonOf('https://localhost/internal-admin')).toBe(
      'host_not_allowed',
    );
    expect(reasonOf('https://[::1]/internal-admin')).toBe('host_not_allowed');
  });

  it('rejects private-range addresses', () => {
    expect(reasonOf('https://10.0.0.8/admin')).toBe('host_not_allowed');
    expect(reasonOf('https://192.168.1.10/router')).toBe('host_not_allowed');
    expect(reasonOf('https://172.16.4.2/admin')).toBe('host_not_allowed');
  });

  it('rejects plain http even on the allowed host', () => {
    expect(
      reasonOf('http://testref.supabase.co/storage/v1/object/public/p.png'),
    ).toBe('not_https');
  });

  it('rejects hostname spoofing tricks', () => {
    expect(reasonOf('https://testref.supabase.co.evil.com/p.png')).toBe(
      'host_not_allowed',
    );
    expect(reasonOf('https://eviltestref.supabase.co/p.png')).toBe(
      'host_not_allowed',
    );
    expect(reasonOf('https://evil.com/testref.supabase.co/p.png')).toBe(
      'host_not_allowed',
    );
    // userinfo trick — the real host here is evil.com
    expect(reasonOf('https://testref.supabase.co@evil.com/p.png')).toBe(
      'host_not_allowed',
    );
  });

  it('rejects the allowed host on a non-default port', () => {
    expect(reasonOf('https://testref.supabase.co:8443/p.png')).toBe(
      'host_not_allowed',
    );
  });

  it('rejects credentials embedded in an otherwise-allowed URL', () => {
    expect(reasonOf('https://user:pass@testref.supabase.co/p.png')).toBe(
      'host_not_allowed',
    );
  });

  it('rejects unparseable URLs', () => {
    expect(reasonOf('not a url at all')).toBe('invalid_url');
  });

  it('fails closed when SUPABASE_URL is missing or malformed', () => {
    // Call directly — an explicit undefined would trigger reasonOf's
    // default parameter and silently test the configured path instead.
    expect(checkImageUrl('https://testref.supabase.co/p.png', undefined)).toEqual({
      ok: false,
      reason: 'allowlist_not_configured',
    });
    expect(reasonOf('https://testref.supabase.co/p.png', '')).toBe(
      'allowlist_not_configured',
    );
    expect(reasonOf('https://testref.supabase.co/p.png', 'not a url')).toBe(
      'allowlist_not_configured',
    );
  });
});
