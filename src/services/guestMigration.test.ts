import { beforeEach, describe, expect, it, vi } from 'vitest';

const { firebaseAuth } = vi.hoisted(() => ({ firebaseAuth: { currentUser: null as any } }));

vi.mock('@/firebase', () => ({ app: {}, auth: firebaseAuth, db: {} }));
vi.mock('@/lib/guestTransferFragment', () => ({
  captureGuestTransferCode: vi.fn(),
  consumeGuestTransferCode: vi.fn(),
}));
vi.mock('firebase/auth', () => ({
  getIdTokenResult: vi.fn(),
  signInWithCustomToken: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
  getDocsFromServer: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}));

import {
  createGuestMigrationClient,
  GuestMigrationIdentityConflictError,
  GuestMigrationTimeoutError,
  GuestMigrationVerificationError,
} from './guestMigration';

const transfer = {
  transferId: 'grant-1',
  sourceUid: 'guest-1',
  customToken: 'private-custom-token',
};
const serverData = {
  sessions: [{ id: 'session-1', volume: 80, duration: 15, startedAt: '2026-10-01T08:00:00.000Z' }],
  settings: { targetVolume: '100', aiContext: { enabled: true } },
};

function makeClient(overrides: Record<string, any> = {}, options: { timeoutMs?: number } = {}) {
  let currentUser: any = null;
  const events: string[] = [];
  const dependencies = {
    currentUser: vi.fn(() => currentUser),
    create: vi.fn(async () => ({
      transferId: 'grant-1', code: 'one-time-code', expiresAt: 1_800_000_000_000,
      destinationOrigin: 'https://pump.arkaes.dev', sourceUid: 'guest-1',
    })),
    redeem: vi.fn(async () => { events.push('redeem'); return transfer; }),
    signInWithToken: vi.fn(async () => {
      events.push('sign-in');
      currentUser = { uid: 'guest-1' };
      return currentUser;
    }),
    tokenClaims: vi.fn(async () => {
      events.push('claims');
      return { guestMigration: true, migrationId: 'grant-1' };
    }),
    readServerData: vi.fn(async () => { events.push('server-read'); return serverData; }),
    confirm: vi.fn(async () => { events.push('confirm'); return { confirmed: true as const, sourceUid: 'guest-1' }; }),
    signOutUnexpectedIdentity: vi.fn(async () => { currentUser = null; }),
    ...overrides,
  };
  return {
    client: createGuestMigrationClient(dependencies, options),
    dependencies,
    events,
    setCurrentUser: (user: any) => { currentUser = user; },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('guest migration client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseAuth.currentUser = null;
    localStorage.clear();
  });

  it('creates a transfer only for a signed-in source and verifies the returned UID', async () => {
    const harness = makeClient();
    harness.setCurrentUser({ uid: 'guest-1' });
    await expect(harness.client.createGuestTransfer({
      campaignId: 'move-2026', destinationOrigin: 'https://pump.arkaes.dev',
    })).resolves.toMatchObject({ sourceUid: 'guest-1', code: 'one-time-code' });
    expect(harness.dependencies.create).toHaveBeenCalledWith({
      campaignId: 'move-2026', destinationOrigin: 'https://pump.arkaes.dev',
    });
  });

  it('rejects a transfer response if the source identity changes while issuance is pending', async () => {
    const pendingCreate = deferred<{
      transferId: string;
      sourceUid: string;
      customToken: string;
      code: string;
      expiresAt: number;
      destinationOrigin: string;
    }>();
    const harness = makeClient({ create: vi.fn(() => pendingCreate.promise) });
    harness.setCurrentUser({ uid: 'guest-1' });
    const request = harness.client.createGuestTransfer({
      campaignId: 'move-2026', destinationOrigin: 'https://pump.arkaes.dev',
    });
    await vi.waitFor(() => expect(harness.dependencies.create).toHaveBeenCalledOnce());
    harness.setCurrentUser({ uid: 'other-account' });
    pendingCreate.resolve({
      ...transfer, code: 'one-time-code', expiresAt: 1_800_000_000_000,
      destinationOrigin: 'https://pump.arkaes.dev',
    });

    await expect(request).rejects.toBeInstanceOf(GuestMigrationVerificationError);
  });

  it('does not use a transfer code while another destination identity is signed in', async () => {
    const harness = makeClient();
    harness.setCurrentUser({ uid: 'other-account' });
    await expect(harness.client.completeGuestMigration('one-time-code'))
      .rejects.toBeInstanceOf(GuestMigrationIdentityConflictError);
    expect(harness.dependencies.redeem).not.toHaveBeenCalled();
  });

  it('confirms only after custom-token UID and verified guest claims match and server reads finish', async () => {
    const harness = makeClient();
    const result = await harness.client.completeGuestMigration('one-time-code');
    expect(result).toEqual({
      transferId: 'grant-1', sourceUid: 'guest-1', ...serverData,
    });
    expect(harness.events).toEqual(['redeem', 'sign-in', 'claims', 'server-read', 'confirm']);
    expect(localStorage.length).toBe(0);
  });

  it('accepts a successful server read of an empty history', async () => {
    const harness = makeClient({ readServerData: vi.fn(async () => ({ sessions: [], settings: {} })) });
    await expect(harness.client.completeGuestMigration('one-time-code'))
      .resolves.toMatchObject({ sessions: [], settings: {} });
    expect(harness.dependencies.confirm).toHaveBeenCalledOnce();
  });

  it('does not report success or confirm when server reads fail, then resumes without redeeming again', async () => {
    const readServerData = vi.fn()
      .mockRejectedValueOnce(new Error('server unavailable'))
      .mockResolvedValueOnce(serverData);
    const harness = makeClient({ readServerData });

    await expect(harness.client.completeGuestMigration('one-time-code')).rejects.toThrow('server unavailable');
    expect(harness.dependencies.confirm).not.toHaveBeenCalled();
    await expect(harness.client.resumeGuestMigration()).resolves.toMatchObject({
      transferId: 'grant-1', sourceUid: 'guest-1', sessions: serverData.sessions,
    });
    expect(harness.dependencies.redeem).toHaveBeenCalledOnce();
    expect(harness.dependencies.confirm).toHaveBeenCalledOnce();
  });

  it('stops before confirmation if the authenticated UID changes while records are being read', async () => {
    const pendingRead = deferred<typeof serverData>();
    const harness = makeClient({ readServerData: vi.fn(() => pendingRead.promise) });
    const completion = harness.client.completeGuestMigration('one-time-code');
    await vi.waitFor(() => expect(harness.dependencies.readServerData).toHaveBeenCalledOnce());
    harness.setCurrentUser({ uid: 'other-account' });
    pendingRead.resolve(serverData);

    await expect(completion).rejects.toThrow('signed-in account changed');
    expect(harness.dependencies.confirm).not.toHaveBeenCalled();
  });

  it('does not report completion if the authenticated UID changes while confirmation is pending', async () => {
    const pendingConfirmation = deferred<{ confirmed: true; sourceUid: string }>();
    const harness = makeClient({ confirm: vi.fn(() => pendingConfirmation.promise) });
    const completion = harness.client.completeGuestMigration('one-time-code');
    await vi.waitFor(() => expect(harness.dependencies.confirm).toHaveBeenCalledOnce());
    harness.setCurrentUser({ uid: 'other-account' });
    pendingConfirmation.resolve({ confirmed: true, sourceUid: 'guest-1' });

    await expect(completion).rejects.toThrow('signed-in account changed');
  });

  it('bounds stalled transfer callables and server reads so the UI can recover', async () => {
    const stalledCreate = makeClient({ create: vi.fn(() => new Promise(() => undefined)) }, { timeoutMs: 5 });
    stalledCreate.setCurrentUser({ uid: 'guest-1' });
    await expect(stalledCreate.client.createGuestTransfer({
      campaignId: 'move-2026', destinationOrigin: 'https://pump.arkaes.dev',
    })).rejects.toBeInstanceOf(GuestMigrationTimeoutError);

    const stalledRedeem = makeClient({ redeem: vi.fn(() => new Promise(() => undefined)) }, { timeoutMs: 5 });
    await expect(stalledRedeem.client.completeGuestMigration('one-time-code'))
      .rejects.toBeInstanceOf(GuestMigrationTimeoutError);
    expect(stalledRedeem.dependencies.signInWithToken).not.toHaveBeenCalled();

    const stalledRead = makeClient({ readServerData: vi.fn(() => new Promise(() => undefined)) }, { timeoutMs: 5 });
    await expect(stalledRead.client.completeGuestMigration('one-time-code'))
      .rejects.toBeInstanceOf(GuestMigrationTimeoutError);
    expect(stalledRead.dependencies.confirm).not.toHaveBeenCalled();
  });

  it('waits for Firebase custom-token sign-in to settle instead of abandoning a live auth mutation', async () => {
    const pendingSignIn = deferred<{ uid: string }>();
    const harness = makeClient({ signInWithToken: vi.fn(() => pendingSignIn.promise) }, { timeoutMs: 5 });
    let settled = false;
    const completion = harness.client.completeGuestMigration('one-time-code').finally(() => { settled = true; });
    await vi.waitFor(() => expect(harness.dependencies.signInWithToken).toHaveBeenCalledOnce());

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(settled).toBe(false);

    const signedInUser = { uid: 'guest-1' };
    harness.setCurrentUser(signedInUser);
    pendingSignIn.resolve(signedInUser);
    await expect(completion).resolves.toMatchObject({ sourceUid: 'guest-1' });
    expect(harness.dependencies.confirm).toHaveBeenCalledOnce();
  });

  it('retries a failed confirmation for the authenticated migration identity without redeeming again', async () => {
    const confirm = vi.fn()
      .mockRejectedValueOnce(new Error('confirmation unavailable'))
      .mockResolvedValueOnce({ confirmed: true as const, sourceUid: 'guest-1' });
    const harness = makeClient({ confirm });

    await expect(harness.client.completeGuestMigration('one-time-code')).rejects.toThrow('confirmation unavailable');
    await expect(harness.client.resumeGuestMigration()).resolves.toMatchObject({ sourceUid: 'guest-1' });
    expect(harness.dependencies.redeem).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('rejects an unexpected custom-token UID and clears that unexpected session', async () => {
    let harness: ReturnType<typeof makeClient>;
    harness = makeClient({
      signInWithToken: vi.fn(async () => {
        const unexpectedUser = { uid: 'wrong-user' };
        harness.setCurrentUser(unexpectedUser);
        return unexpectedUser;
      }),
    });
    await expect(harness.client.completeGuestMigration('one-time-code'))
      .rejects.toBeInstanceOf(GuestMigrationVerificationError);
    expect(harness.dependencies.signOutUnexpectedIdentity).toHaveBeenCalledOnce();
    expect(harness.dependencies.readServerData).not.toHaveBeenCalled();
    expect(harness.dependencies.confirm).not.toHaveBeenCalled();
  });

  it('does not confirm when Firebase custom-token sign-in fails', async () => {
    const harness = makeClient({ signInWithToken: vi.fn(async () => { throw new Error('sign-in failed'); }) });
    await expect(harness.client.completeGuestMigration('one-time-code')).rejects.toThrow('sign-in failed');
    expect(harness.dependencies.readServerData).not.toHaveBeenCalled();
    expect(harness.dependencies.confirm).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('rejects custom tokens without the matching verified migration claim', async () => {
    const harness = makeClient({ tokenClaims: vi.fn(async () => ({ guestMigration: true, migrationId: 'other-grant' })) });
    await expect(harness.client.completeGuestMigration('one-time-code'))
      .rejects.toBeInstanceOf(GuestMigrationVerificationError);
    expect(harness.dependencies.readServerData).not.toHaveBeenCalled();
    expect(harness.dependencies.confirm).not.toHaveBeenCalled();
  });

  it('cannot resume without a verified migration token', async () => {
    const harness = makeClient({ tokenClaims: vi.fn(async () => ({})) });
    harness.setCurrentUser({ uid: 'guest-1' });
    await expect(harness.client.resumeGuestMigration()).rejects.toBeInstanceOf(GuestMigrationVerificationError);
    expect(harness.dependencies.readServerData).not.toHaveBeenCalled();
    expect(harness.dependencies.confirm).not.toHaveBeenCalled();
  });

  it('does not read records if the current UID changes while resume claims are being checked', async () => {
    const pendingClaims = deferred<Record<string, unknown>>();
    const harness = makeClient({ tokenClaims: vi.fn(() => pendingClaims.promise) });
    harness.setCurrentUser({ uid: 'guest-1' });
    const resume = harness.client.resumeGuestMigration();
    await vi.waitFor(() => expect(harness.dependencies.tokenClaims).toHaveBeenCalledOnce());
    harness.setCurrentUser({ uid: 'other-account' });
    pendingClaims.resolve({ guestMigration: true, migrationId: 'grant-1' });

    await expect(resume).rejects.toThrow('signed-in account changed');
    expect(harness.dependencies.readServerData).not.toHaveBeenCalled();
  });

  it('does not confirm when the source profile is missing or held by cleanup', async () => {
    const missingProfile = makeClient({
      readServerData: vi.fn(async () => ({ ...serverData, profileExists: false })),
    });
    await expect(missingProfile.client.completeGuestMigration('one-time-code')).rejects.toThrow('source guest profile');
    expect(missingProfile.dependencies.confirm).not.toHaveBeenCalled();

    const cleanupLease = makeClient({
      readServerData: vi.fn(async () => ({
        ...serverData,
        cleanupLeaseExpiresAt: { toMillis: () => Date.now() + 60_000 },
      })),
    });
    await expect(cleanupLease.client.completeGuestMigration('one-time-code')).rejects.toThrow('safely cleaned up');
    expect(cleanupLease.dependencies.confirm).not.toHaveBeenCalled();
  });

  it('does not accept a transfer creation response for another UID', async () => {
    const harness = makeClient({ create: vi.fn(async () => ({
      transferId: 'grant-1', code: 'one-time-code', expiresAt: 1,
      destinationOrigin: 'https://pump.arkaes.dev', sourceUid: 'wrong-user',
    })) });
    harness.setCurrentUser({ uid: 'guest-1' });
    await expect(harness.client.createGuestTransfer({
      campaignId: 'move-2026', destinationOrigin: 'https://pump.arkaes.dev',
    })).rejects.toBeInstanceOf(GuestMigrationVerificationError);
  });
});
