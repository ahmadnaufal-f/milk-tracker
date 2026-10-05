import { getIdTokenResult, signInWithCustomToken, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, db } from '@/firebase';
import { consumeGuestTransferCode, captureGuestTransferCode } from '@/lib/guestTransferFragment';
import { isGuestCleanupLeaseActive, UserSettings, PumpingSession } from '@/services/storage';

export interface GuestTransferRequest {
  campaignId: string;
  destinationOrigin: string;
}

export interface GuestTransfer {
  transferId: string;
  code: string;
  expiresAt: number;
  destinationOrigin: string;
  sourceUid: string;
}

export interface GuestMigrationResult {
  transferId: string;
  sourceUid: string;
  sessions: PumpingSession[];
  settings: UserSettings;
}

export class GuestMigrationIdentityConflictError extends Error {
  readonly code = 'guest-migration/identity-conflict';

  constructor() {
    super('Sign out of the current account before opening this guest transfer.');
    this.name = 'GuestMigrationIdentityConflictError';
  }
}

export class GuestMigrationVerificationError extends Error {
  readonly code = 'guest-migration/verification-failed';

  constructor(message: string) {
    super(message);
    this.name = 'GuestMigrationVerificationError';
  }
}

export class GuestMigrationTimeoutError extends Error {
  readonly code = 'guest-migration/timeout';

  constructor() {
    super('The server did not respond in time. Please try again when your connection is steady.');
    this.name = 'GuestMigrationTimeoutError';
  }
}

interface RedeemedTransfer {
  transferId: string;
  customToken: string;
  sourceUid: string;
}

interface ConfirmedTransfer {
  confirmed: true;
  sourceUid: string;
}

export interface GuestMigrationDependencies {
  currentUser(): User | null;
  create(request: GuestTransferRequest): Promise<GuestTransfer>;
  redeem(code: string): Promise<RedeemedTransfer>;
  signInWithToken(token: string): Promise<User>;
  tokenClaims(user: User): Promise<Record<string, unknown>>;
  readServerData(uid: string): Promise<{
    sessions: PumpingSession[];
    settings: UserSettings;
    profileExists?: boolean;
    cleanupLeaseExpiresAt?: unknown;
  }>;
  confirm(transferId: string): Promise<ConfirmedTransfer>;
  signOutUnexpectedIdentity?(): Promise<void>;
}

export interface GuestMigrationClientOptions {
  timeoutMs?: number;
}

const withTimeout = <T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = Promise.resolve().then(operation);
  return Promise.race([
    result,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new GuestMigrationTimeoutError()), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
};

export function createGuestMigrationClient(
  dependencies: GuestMigrationDependencies,
  options: GuestMigrationClientOptions = {},
) {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
  const waitFor = <T>(operation: () => Promise<T>) => withTimeout(operation, timeoutMs);

  const assertCurrentUid = (expectedUid: string) => {
    if (dependencies.currentUser()?.uid !== expectedUid) {
      throw new GuestMigrationVerificationError('The signed-in account changed during the transfer.');
    }
  };

  const finishMigration = async (transferId: string, sourceUid: string): Promise<GuestMigrationResult> => {
    assertCurrentUid(sourceUid);
    const data = await waitFor(() => dependencies.readServerData(sourceUid));
    assertCurrentUid(sourceUid);
    if (data.profileExists === false) {
      throw new GuestMigrationVerificationError('The source guest profile could not be verified.');
    }
    if (isGuestCleanupLeaseActive(data.cleanupLeaseExpiresAt)) {
      throw new GuestMigrationVerificationError('The source guest profile is being safely cleaned up.');
    }
    const confirmation = await waitFor(() => dependencies.confirm(transferId));
    assertCurrentUid(sourceUid);
    if (!confirmation.confirmed || confirmation.sourceUid !== sourceUid) {
      throw new GuestMigrationVerificationError('The transfer could not be confirmed.');
    }
    return { transferId, sourceUid, sessions: data.sessions, settings: data.settings };
  };

  return {
    async createGuestTransfer(request: GuestTransferRequest): Promise<GuestTransfer> {
      const user = dependencies.currentUser();
      if (!user) throw new GuestMigrationVerificationError('A signed-in guest session is required.');

      const transfer = await waitFor(() => dependencies.create(request));
      if (dependencies.currentUser()?.uid !== user.uid) {
        throw new GuestMigrationVerificationError('The signed-in account changed while the link was being created.');
      }
      if (transfer.sourceUid !== user.uid) {
        throw new GuestMigrationVerificationError('The transfer was created for a different account.');
      }
      return transfer;
    },

    async completeGuestMigration(code: string): Promise<GuestMigrationResult> {
      // An existing identity is never replaced implicitly. The UI can ask the
      // user to sign out explicitly, then retry with the code still in memory.
      if (dependencies.currentUser()) throw new GuestMigrationIdentityConflictError();

      let transferCode = code;
      let customToken = '';
      try {
        const grant = await waitFor(() => dependencies.redeem(transferCode));
        customToken = grant.customToken;
        transferCode = '';

        if (!grant.sourceUid || !grant.transferId || !customToken) {
          throw new GuestMigrationVerificationError('The transfer link could not be verified.');
        }
        if (dependencies.currentUser()) throw new GuestMigrationIdentityConflictError();

        // Firebase sign-in mutates global auth state. Racing it against a local
        // timer would leave a live sign-in running after this call rejected,
        // which could replace a later user session when it eventually settles.
        const signedInUser = await dependencies.signInWithToken(customToken);
        customToken = '';
        if (signedInUser.uid !== grant.sourceUid || dependencies.currentUser()?.uid !== grant.sourceUid) {
          if (dependencies.currentUser()?.uid === signedInUser.uid) {
            if (dependencies.signOutUnexpectedIdentity) {
              await waitFor(() => dependencies.signOutUnexpectedIdentity!());
            }
          }
          throw new GuestMigrationVerificationError('The signed-in account does not match the transfer.');
        }

        const claims = await waitFor(() => dependencies.tokenClaims(signedInUser));
        if (claims.guestMigration !== true || claims.migrationId !== grant.transferId) {
          throw new GuestMigrationVerificationError('The guest transfer identity could not be verified.');
        }

        // Empty history succeeds only because readServerData returned from a
        // server query; a failed read throws before the grant is confirmed.
        return await finishMigration(grant.transferId, grant.sourceUid);
      } finally {
        // Secrets live only in this call's memory and are never persisted.
        transferCode = '';
        customToken = '';
      }
    },

    async resumeGuestMigration(): Promise<GuestMigrationResult> {
      const user = dependencies.currentUser();
      if (!user) throw new GuestMigrationVerificationError('Sign in to continue this guest transfer.');
      const claims = await waitFor(() => dependencies.tokenClaims(user));
      if (claims.guestMigration !== true || typeof claims.migrationId !== 'string' || !claims.migrationId) {
        throw new GuestMigrationVerificationError('There is no verified guest transfer to resume.');
      }
      return finishMigration(claims.migrationId, user.uid);
    },
  };
}

const functions = getFunctions(app, 'asia-southeast1');
const callCreateGuestMigration = httpsCallable<GuestTransferRequest, GuestTransfer>(functions, 'createGuestMigration');
const callRedeemGuestMigration = httpsCallable<{ code: string }, RedeemedTransfer>(functions, 'redeemGuestMigration');
const callConfirmGuestMigration = httpsCallable<{ transferId: string }, ConfirmedTransfer>(functions, 'confirmGuestMigration');

const defaultClient = createGuestMigrationClient({
  currentUser: () => auth.currentUser,
  create: async (request) => (await callCreateGuestMigration(request)).data,
  redeem: async (code) => (await callRedeemGuestMigration({ code })).data,
  signInWithToken: async (token) => (await signInWithCustomToken(auth, token)).user,
  tokenClaims: async (user) => (await getIdTokenResult(user, true)).claims,
  signOutUnexpectedIdentity: async () => {
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  },
  readServerData: async (uid) => {
    const [sessionsSnapshot, settingsSnapshot] = await Promise.all([
      getDocsFromServer(collection(db, 'users', uid, 'sessions')),
      getDocFromServer(doc(db, 'users', uid)),
    ]);
    if (sessionsSnapshot.metadata.fromCache || settingsSnapshot.metadata.fromCache) {
      throw new GuestMigrationVerificationError('The records could not be checked with the server.');
    }
    const sessions = sessionsSnapshot.docs.map((session) => ({
      id: session.id,
      ...session.data(),
    } as PumpingSession));
    const settings = settingsSnapshot.exists() ? settingsSnapshot.data() as UserSettings : {};
    return {
      sessions,
      settings,
      profileExists: settingsSnapshot.exists(),
      cleanupLeaseExpiresAt: settingsSnapshot.exists() ? settingsSnapshot.get('guestCleanupLeaseExpiresAt') : null,
    };
  },
  confirm: async (transferId) => (await callConfirmGuestMigration({ transferId })).data,
});

export const createGuestTransfer = defaultClient.createGuestTransfer;
export const completeGuestMigration = defaultClient.completeGuestMigration;
export const resumeGuestMigration = defaultClient.resumeGuestMigration;

/**
 * The bootstrap entry captures and removes the fragment before Firebase and
 * other application modules load. Fallback capture keeps direct test imports
 * and non-bootstrap entry points safe as well.
 */
export function takeGuestTransferCodeFromFragment(): string | null {
  const captured = consumeGuestTransferCode();
  if (captured) return captured;
  captureGuestTransferCode();
  return consumeGuestTransferCode();
}
