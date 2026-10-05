import { beforeEach, describe, expect, it } from 'vitest';
import { captureGuestTransferCode, consumeGuestTransferCode } from './guestTransferFragment';

describe('private transfer fragment bootstrap', () => {
  beforeEach(() => {
    consumeGuestTransferCode();
    window.history.replaceState(null, '', '/migration');
  });

  it('removes the private code before app initialization and retains it only for one consumer', () => {
    window.history.replaceState({ from: 'old-app' }, '', '/migration?lang=id#transfer=private-code&step=welcome');
    captureGuestTransferCode();
    expect(window.location.href).not.toContain('private-code');
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/migration?lang=id#step=welcome');
    expect(window.history.state).toEqual({ from: 'old-app' });
    expect(consumeGuestTransferCode()).toBe('private-code');
    expect(consumeGuestTransferCode()).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('preserves unrelated navigation fragments', () => {
    window.history.replaceState(null, '', '/privacy#data-storage');
    captureGuestTransferCode();
    expect(window.location.hash).toBe('#data-storage');
    expect(consumeGuestTransferCode()).toBeNull();
  });

  it('does not lose a captured code when called again after the fragment is removed', () => {
    window.history.replaceState(null, '', '/migration#transfer=once');
    captureGuestTransferCode();
    captureGuestTransferCode();
    expect(consumeGuestTransferCode()).toBe('once');
  });
});
