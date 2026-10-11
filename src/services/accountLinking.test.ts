import { beforeEach, describe, expect, it, vi } from 'vitest';

const { linkWithPopup, getIdTokenResult, reauthenticateWithPopup, markGuestAccountLinked, refreshGuestActivity } = vi.hoisted(() => ({
  linkWithPopup: vi.fn(),
  getIdTokenResult: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  markGuestAccountLinked: vi.fn(),
  refreshGuestActivity: vi.fn(),
}));

vi.mock('@/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'guest-uid' } } }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class GoogleAuthProvider {},
  linkWithPopup,
  getIdTokenResult,
  reauthenticateWithPopup,
}));
vi.mock('@/services/storage', () => ({ refreshGuestActivity, markGuestAccountLinked }));

import { linkGuestAccount } from './accountLinking';

describe('linkGuestAccount', () => {
  const guestUser = { uid: 'guest-uid' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    refreshGuestActivity.mockResolvedValue({ status: 'updated' });
    markGuestAccountLinked.mockResolvedValue(true);
    getIdTokenResult.mockResolvedValue({ claims: { firebase: { sign_in_provider: 'google.com' } } });
  });

  it('keeps the original UID and marks its profile as linked after success', async () => {
    linkWithPopup.mockResolvedValue({ user: { uid: 'guest-uid' } });

    const result = await linkGuestAccount(guestUser);

    expect(result).toMatchObject({ status: 'linked', user: { uid: 'guest-uid' } });
    expect(markGuestAccountLinked).toHaveBeenCalledWith('guest-uid');
    expect(getIdTokenResult).toHaveBeenCalledWith({ uid: 'guest-uid' }, true);
    expect(refreshGuestActivity).toHaveBeenCalledWith('guest-uid');
    expect(getIdTokenResult.mock.invocationCallOrder[getIdTokenResult.mock.invocationCallOrder.length - 1])
      .toBeLessThan(markGuestAccountLinked.mock.invocationCallOrder[0]);
  });

  it('preserves the guest identity on an already-used Google credential', async () => {
    linkWithPopup.mockRejectedValue({ code: 'auth/credential-already-in-use' });

    await expect(linkGuestAccount(guestUser)).resolves.toEqual({ status: 'collision' });
    expect(markGuestAccountLinked).not.toHaveBeenCalled();
  });

  it('reauthenticates the same UID before finalizing a migrated custom-token session', async () => {
    getIdTokenResult
      .mockResolvedValueOnce({ claims: { guestMigration: true, firebase: { sign_in_provider: 'custom' } } })
      .mockResolvedValueOnce({ claims: { guestMigration: true, firebase: { sign_in_provider: 'google.com' } } });
    reauthenticateWithPopup.mockResolvedValue({ user: { uid: 'guest-uid', marker: 'same-guest' } });
    linkWithPopup.mockResolvedValue({ user: { uid: 'guest-uid' } });

    await expect(linkGuestAccount(guestUser)).resolves.toMatchObject({
      status: 'linked', user: { uid: 'guest-uid', marker: 'same-guest' },
    });
    expect(reauthenticateWithPopup).toHaveBeenCalledWith({ uid: 'guest-uid' }, expect.anything());
    expect(reauthenticateWithPopup.mock.invocationCallOrder[0])
      .toBeLessThan(markGuestAccountLinked.mock.invocationCallOrder[0]);
    expect(markGuestAccountLinked).toHaveBeenCalledWith('guest-uid');
  });

  it('returns a recovery state instead of claiming success if Google reauthentication cannot finish', async () => {
    getIdTokenResult.mockResolvedValue({ claims: { guestMigration: true, firebase: { sign_in_provider: 'custom' } } });
    reauthenticateWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    linkWithPopup.mockResolvedValue({ user: { uid: 'guest-uid' } });

    await expect(linkGuestAccount(guestUser)).resolves.toEqual({ status: 'reauth-required' });
    expect(markGuestAccountLinked).toHaveBeenCalledWith('guest-uid');
    expect(reauthenticateWithPopup.mock.invocationCallOrder[0])
      .toBeLessThan(markGuestAccountLinked.mock.invocationCallOrder[0]);
  });

  it('checks the normal Google token before requiring server confirmation of the guest profile update', async () => {
    markGuestAccountLinked.mockResolvedValue(false);
    linkWithPopup.mockResolvedValue({ user: { uid: 'guest-uid' } });

    await expect(linkGuestAccount(guestUser)).resolves.toEqual({ status: 'reauth-required' });
    expect(getIdTokenResult).toHaveBeenCalledWith({ uid: 'guest-uid' }, true);
    expect(getIdTokenResult.mock.invocationCallOrder[0])
      .toBeLessThan(markGuestAccountLinked.mock.invocationCallOrder[0]);
  });

  it('does not open the Google popup while a cleanup lease is active', async () => {
    refreshGuestActivity.mockResolvedValue({ status: 'cleanup-in-progress' });
    const result = await linkGuestAccount(guestUser);
    expect(result.status).toBe('error');
    expect(linkWithPopup).not.toHaveBeenCalled();
    expect(markGuestAccountLinked).not.toHaveBeenCalled();
  });

  it('returns a cancellation state when the popup closes', async () => {
    linkWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
    await expect(linkGuestAccount(guestUser)).resolves.toEqual({ status: 'cancelled' });
    expect(markGuestAccountLinked).not.toHaveBeenCalled();
  });

  it('reports profile update failures without claiming the guest link completed', async () => {
    linkWithPopup.mockResolvedValue({ user: { uid: 'guest-uid' } });
    markGuestAccountLinked.mockRejectedValue(new Error('permission denied'));
    const result = await linkGuestAccount(guestUser);
    expect(result.status).toBe('error');
  });
});
