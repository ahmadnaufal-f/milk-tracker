import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocFromServer, waitForPendingWrites, updateDoc, serverTimestamp, doc } = vi.hoisted(() => ({
  getDocFromServer: vi.fn(),
  waitForPendingWrites: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
  doc: vi.fn((_db, ...segments) => segments.join('/')),
}));

vi.mock('@/firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), addDoc: vi.fn(), onSnapshot: vi.fn(), query: vi.fn(), orderBy: vi.fn(),
  where: vi.fn(), serverTimestamp, doc, setDoc: vi.fn(), updateDoc,
  deleteDoc: vi.fn(), getDocFromServer, waitForPendingWrites,
}));

import { markGuestAccountLinked, prepareForDomainMigration, refreshGuestActivity } from './storage';

describe('prepareForDomainMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    waitForPendingWrites.mockResolvedValue(undefined);
    getDocFromServer.mockResolvedValue({ metadata: { fromCache: false } });
    updateDoc.mockResolvedValue(undefined);
    serverTimestamp.mockReturnValue('server-time');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('allows navigation only after pending writes and a server-backed user read succeed', async () => {
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: true });
    expect(waitForPendingWrites).toHaveBeenCalledOnce();
    expect(getDocFromServer).toHaveBeenCalledOnce();
  });

  it.each([
    [{ isPumping: true, isBusy: false }, 'active-session'],
    [{ isPumping: false, isBusy: true }, 'saving'],
  ] as const)('blocks unsafe app state %s', async (state, reason) => {
    await expect(prepareForDomainMigration('guest-1', state)).resolves.toEqual({ safe: false, reason });
    expect(waitForPendingWrites).not.toHaveBeenCalled();
  });

  it.each(['pumping_startTime', 'unsavedSession'] as const)('blocks local %s state', async (key) => {
    localStorage.setItem(key, 'pending');
    const reason = key === 'pumping_startTime' ? 'active-session' : 'unsaved-session';
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: false, reason });
    expect(localStorage.getItem(key)).toBe('pending');
    expect(waitForPendingWrites).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    await expect(prepareForDomainMigration(null, { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: false, reason: 'missing-user' });
  });

  it('does not treat a server read failure as a successful empty account', async () => {
    getDocFromServer.mockRejectedValue(new Error('unavailable'));
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: false, reason: 'sync-failed' });
  });

  it('rejects a cached snapshot even when no error was thrown', async () => {
    getDocFromServer.mockResolvedValue({ metadata: { fromCache: true } });
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: false, reason: 'sync-failed' });
  });

  it('does not use browser online state as proof of synchronization', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: false, reason: 'offline' });
    expect(waitForPendingWrites).not.toHaveBeenCalled();
    expect(getDocFromServer).not.toHaveBeenCalled();
  });

  it('bounds a stalled pending-write wait', async () => {
    waitForPendingWrites.mockReturnValue(new Promise(() => undefined));
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false, timeoutMs: 1 }))
      .resolves.toEqual({ safe: false, reason: 'sync-timeout' });
  });

  it('rechecks for a local timer created while synchronization is in progress', async () => {
    waitForPendingWrites.mockImplementation(async () => {
      localStorage.setItem('pumping_startTime', 'started-during-sync');
    });
    await expect(prepareForDomainMigration('guest-1', { isPumping: false, isBusy: false }))
      .resolves.toEqual({ safe: false, reason: 'active-session' });
    expect(getDocFromServer).not.toHaveBeenCalled();
  });

  it('refreshes lastActive only for a server-confirmed, unlocked guest profile', async () => {
    const profileSnapshot = {
      metadata: { fromCache: false },
      exists: () => true,
      get: (field: string) => field === 'isAnonymous' ? true : null,
    };
    getDocFromServer.mockResolvedValue(profileSnapshot);

    await expect(refreshGuestActivity('guest-1')).resolves.toEqual({ status: 'updated' });
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { lastActive: 'server-time' });
    expect(getDocFromServer).toHaveBeenCalledTimes(2);
  });

  it('blocks guest activity refresh when a server cleanup lease is active', async () => {
    getDocFromServer.mockResolvedValue({
      metadata: { fromCache: false },
      exists: () => true,
      get: (field: string) => field === 'isAnonymous'
        ? true
        : field === 'guestCleanupLeaseExpiresAt' ? Date.now() + 60_000 : null,
    });

    await expect(refreshGuestActivity('guest-1')).resolves.toEqual({ status: 'cleanup-in-progress' });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('marks a linked guest profile only after the server confirms isAnonymous is false', async () => {
    const guestProfile = {
      metadata: { fromCache: false },
      exists: () => true,
      get: (field: string) => field === 'isAnonymous' ? true : null,
    };
    const linkedProfile = {
      metadata: { fromCache: false },
      exists: () => true,
      get: (field: string) => field === 'isAnonymous' ? false : null,
    };
    getDocFromServer.mockResolvedValueOnce(guestProfile).mockResolvedValueOnce(linkedProfile);

    await expect(markGuestAccountLinked('guest-1')).resolves.toBe(true);
    expect(updateDoc).toHaveBeenCalledWith('users/guest-1', {
      isAnonymous: false,
      lastActive: 'server-time',
    });
    expect(getDocFromServer).toHaveBeenCalledTimes(2);
  });

  it('does not write a linked profile while a cleanup lease is active', async () => {
    getDocFromServer.mockResolvedValue({
      metadata: { fromCache: false },
      exists: () => true,
      get: (field: string) => field === 'isAnonymous'
        ? true
        : field === 'guestCleanupLeaseExpiresAt' ? Date.now() + 60_000 : null,
    });

    await expect(markGuestAccountLinked('guest-1')).resolves.toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
