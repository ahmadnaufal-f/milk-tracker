import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStandalonePwa } from './pwa';

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined });
});

describe('isStandalonePwa', () => {
  it('detects standalone display mode', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    expect(isStandalonePwa()).toBe(true);
  });

  it('detects the iOS standalone flag', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    expect(isStandalonePwa()).toBe(true);
  });

  it('returns false in a regular browser tab', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    expect(isStandalonePwa()).toBe(false);
  });
});
