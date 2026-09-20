import { describe, expect, it } from 'vitest';

import { SHARED_LINK_PREFIX, publicEventPath, publicEventUrl, sharedLinkHost } from './links';

/**
 * These four are the contract between the app, the panel, the public page and
 * the two files the stores fetch to verify a deep link. Nothing enforces that
 * agreement at runtime — a link that does not match just opens the browser —
 * so it is enforced here.
 */
describe('publicEventPath', () => {
  it('starts with the prefix the app claims', () => {
    expect(publicEventPath('la-zubia', 'abc')).toBe('/e/la-zubia/abc');
    expect(publicEventPath('la-zubia', 'abc').startsWith(SHARED_LINK_PREFIX)).toBe(true);
  });
});

describe('publicEventUrl', () => {
  it('joins the site and the path', () => {
    expect(publicEventUrl('https://hoyq.es', 'otura', 'e1')).toBe('https://hoyq.es/e/otura/e1');
  });

  it('does not double the slash when the site ends in one', () => {
    expect(publicEventUrl('https://hoyq.es/', 'otura', 'e1')).toBe('https://hoyq.es/e/otura/e1');
  });
});

describe('sharedLinkHost', () => {
  it('takes the host out of the site url', () => {
    expect(sharedLinkHost('https://hoyq.es')).toBe('hoyq.es');
  });

  it('keeps the port, which a local build has and a claim has to match', () => {
    expect(sharedLinkHost('http://localhost:3000')).toBe('localhost:3000');
  });

  it('is null while there is no site, rather than a host nobody owns', () => {
    expect(sharedLinkHost('')).toBeNull();
    expect(sharedLinkHost('   ')).toBeNull();
  });

  it('lower-cases it, because a claim is compared as text', () => {
    expect(sharedLinkHost('https://HoyQ.ES')).toBe('hoyq.es');
  });

  // Claiming a malformed host is the silent failure this guards: both stores
  // would fetch nothing and hand the link to the browser for ever.
  it('refuses something that is not a url', () => {
    expect(() => sharedLinkHost('hoyq.es')).toThrow(/Not a URL/);
    expect(() => sharedLinkHost('ftp://hoyq.es')).toThrow(/Not a URL/);
    expect(() => sharedLinkHost('https://')).toThrow(/Not a URL/);
  });
});
