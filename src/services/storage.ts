import { db } from "../firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  FieldValue,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocFromServer,
  waitForPendingWrites
} from "firebase/firestore";

// Helper to get collection reference
const getUserSessionsCollection = (userId: string) => collection(db, 'users', userId, 'sessions');
const getUserDocument = (userId: string) => doc(db, 'users', userId);

export type GuestActivityRefreshResult =
  | { status: 'updated' }
  | { status: 'not-guest' | 'cleanup-in-progress' | 'missing-profile' | 'unavailable' };

export function isGuestCleanupLeaseActive(expiresAt: unknown, now = Date.now()): boolean {
  if (expiresAt == null) return false;
  if (typeof expiresAt === 'number') return expiresAt > now;
  if (expiresAt instanceof Date) return expiresAt.getTime() > now;
  if (typeof expiresAt !== 'object' || !('toMillis' in expiresAt) || typeof expiresAt.toMillis !== 'function') return true;
  try {
    return expiresAt.toMillis() > now;
  } catch {
    return true;
  }
}

const hasActiveGuestCleanupLease = (snapshot: Awaited<ReturnType<typeof getDocFromServer>>): boolean => {
  return isGuestCleanupLeaseActive(snapshot.get('guestCleanupLeaseExpiresAt'));
};

/** Refreshes the retention clock only for a server-confirmed, unlocked guest profile. */
export async function refreshGuestActivity(userId: string): Promise<GuestActivityRefreshResult> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'unavailable' };
    const deadline = Date.now() + 8_000;
    const remainingTime = () => Math.max(1, deadline - Date.now());
    const profileRef = getUserDocument(userId);
    const before = await waitWithin(getDocFromServer(profileRef), remainingTime());
    if (before.metadata.fromCache) return { status: 'unavailable' };
    if (!before.exists()) return { status: 'missing-profile' };
    if (before.get('isAnonymous') !== true) return { status: 'not-guest' };
    if (hasActiveGuestCleanupLease(before)) return { status: 'cleanup-in-progress' };

    await waitWithin(updateDoc(profileRef, { lastActive: serverTimestamp() }), remainingTime());
    await waitWithin(waitForPendingWrites(db), remainingTime());
    const after = await waitWithin(getDocFromServer(profileRef), remainingTime());
    if (after.metadata.fromCache) return { status: 'unavailable' };
    if (!after.exists()) return { status: 'missing-profile' };
    if (after.get('isAnonymous') !== true) return { status: 'not-guest' };
    if (hasActiveGuestCleanupLease(after)) return { status: 'cleanup-in-progress' };
    return { status: 'updated' };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Finalizes guest metadata only after a linked profile can be verified at the server. */
export async function markGuestAccountLinked(userId: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const deadline = Date.now() + 8_000;
    const remainingTime = () => Math.max(1, deadline - Date.now());
    const profileRef = getUserDocument(userId);
    const before = await waitWithin(getDocFromServer(profileRef), remainingTime());
    if (before.metadata.fromCache || !before.exists() || hasActiveGuestCleanupLease(before)) return false;
    if (before.get('isAnonymous') === false) return true;
    if (before.get('isAnonymous') !== true) return false;

    await waitWithin(updateDoc(profileRef, {
      isAnonymous: false,
      lastActive: serverTimestamp(),
    }), remainingTime());
    await waitWithin(waitForPendingWrites(db), remainingTime());
    const after = await waitWithin(getDocFromServer(profileRef), remainingTime());
    return !after.metadata.fromCache && after.exists() &&
      after.get('isAnonymous') === false && !hasActiveGuestCleanupLease(after);
  } catch {
    return false;
  }
}

export type MigrationPreparationFailure =
  | 'missing-user'
  | 'saving'
  | 'active-session'
  | 'unsaved-session'
  | 'offline'
  | 'sync-timeout'
  | 'sync-failed';

export type MigrationPreparationResult =
  | { safe: true }
  | { safe: false; reason: MigrationPreparationFailure };

export interface MigrationPreparationState {
  isPumping: boolean;
  isBusy: boolean;
  timeoutMs?: number;
}

const hasLocalPumpingState = (): MigrationPreparationFailure | null => {
  try {
    if (localStorage.getItem('pumping_startTime')) return 'active-session';
    if (localStorage.getItem('unsavedSession')) return 'unsaved-session';
  } catch {
    // If browser storage is unavailable, the React state checks still apply.
  }
  return null;
};

const waitWithin = async <T>(promise: Promise<T>, milliseconds: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('migration-sync-timeout')), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/**
 * Confirms this user's queued Firestore writes have settled and the user
 * document can be fetched from the server before a domain change.
 */
export async function prepareForDomainMigration(
  userId: string | null,
  state: MigrationPreparationState,
): Promise<MigrationPreparationResult> {
  if (!userId) return { safe: false, reason: 'missing-user' };
  if (state.isBusy) return { safe: false, reason: 'saving' };
  if (state.isPumping) return { safe: false, reason: 'active-session' };

  const localState = hasLocalPumpingState();
  if (localState) return { safe: false, reason: localState };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { safe: false, reason: 'offline' };
  }

  const timeoutMs = Math.max(1, state.timeoutMs ?? 8_000);
  const deadline = Date.now() + timeoutMs;
  const remainingTime = () => Math.max(1, deadline - Date.now());

  try {
    await waitWithin(waitForPendingWrites(db), remainingTime());
    if (state.isBusy) return { safe: false, reason: 'saving' };
    if (state.isPumping) return { safe: false, reason: 'active-session' };
    const pendingLocalState = hasLocalPumpingState();
    if (pendingLocalState) return { safe: false, reason: pendingLocalState };
    const serverSnapshot = await waitWithin(getDocFromServer(getUserDocument(userId)), remainingTime());
    if (serverSnapshot.metadata.fromCache) return { safe: false, reason: 'sync-failed' };
  } catch (error) {
    if (error instanceof Error && error.message === 'migration-sync-timeout') {
      return { safe: false, reason: 'sync-timeout' };
    }
    return { safe: false, reason: 'sync-failed' };
  }

  // Check again after the network round trip so a session started while the
  // sync check was running cannot slip through.
  if (state.isBusy) return { safe: false, reason: 'saving' };
  if (state.isPumping) return { safe: false, reason: 'active-session' };
  const changedLocalState = hasLocalPumpingState();
  if (changedLocalState) return { safe: false, reason: changedLocalState };
  return { safe: true };
}

export interface PumpingGoal {
  freezerStash: boolean;
  maintainingSupply: boolean;
  increasingSupply: boolean;
  returningToWork: boolean;
  weaning: boolean;
}

export interface AISummarizationContext {
  enabled: boolean;
  babyBirthdate?: string; // Format YYYY-MM-DD
  feedingMethod?: 'exclusive' | 'supplemental';
  pumpingGoal?: PumpingGoal;
}

export interface UserSettings {
  targetVolume?: string;
  targetDuration?: string;
  reminderHours?: string;
  aiContext?: AISummarizationContext;
}

export const initAnonymousUserDoc = async (userId: string) => {
  try {
    await setDoc(getUserDocument(userId), {
      isAnonymous: true,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('Error initialising anonymous user doc:', e);
  }
};

export const updateLastActive = async (userId: string) => {
  try {
    await updateDoc(getUserDocument(userId), { lastActive: serverTimestamp() });
  } catch (e) {
    console.error('Error updating lastActive:', e);
  }
};

export const saveUserSettings = async (userId: string, settings: UserSettings) => {
  try {
    await setDoc(getUserDocument(userId), settings, { merge: true });
  } catch (e) {
    console.error("Error saving settings: ", e);
    throw e;
  }
};

export const subscribeToSettings = (userId: string, callback: (settings: UserSettings) => void) => {
  return onSnapshot(getUserDocument(userId), (doc) => {
    if (doc.exists()) {
      callback(doc.data() as UserSettings);
    } else {
      callback({});
    }
  });
};

export interface PumpingSession {
  id?: string;
  volume: number;
  duration: number;
  startedAt: string | Date;
  createdAt?: FieldValue;
}

export const addSession = async (userId: string, sessionData: Omit<PumpingSession, 'id' | 'createdAt'>): Promise<string> => {
  try {
    const docRef = await addDoc(getUserSessionsCollection(userId), {
      ...sessionData,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (e) {
    console.error("Error adding document: ", e);
    throw e;
  }
};

export const updateSession = async (userId: string, sessionId: string, sessionData: Partial<Omit<PumpingSession, 'id' | 'createdAt'>>) => {
  try {
    const docRef = doc(db, 'users', userId, 'sessions', sessionId);
    await setDoc(docRef, sessionData, { merge: true });
  } catch (e) {
    console.error("Error updating document: ", e);
    throw e;
  }
};

export const deleteSession = async (userId: string, sessionId: string) => {
  try {
    const docRef = doc(db, 'users', userId, 'sessions', sessionId);
    await deleteDoc(docRef);
  } catch (e) {
    console.error("Error deleting document: ", e);
    throw e;
  }
};

export const subscribeToSessions = (userId: string, callback: (sessions: PumpingSession[]) => void, filterDate?: Date) => {
  // Build query constraints
  const constraints: any[] = [orderBy("startedAt", "desc")];

  if (filterDate) {
    // Create range for the entire day (00:00:00 to 23:59:59)
    const startOfDay = new Date(filterDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(filterDate);
    endOfDay.setHours(23, 59, 59, 999);

    constraints.push(where("startedAt", ">=", startOfDay.toISOString()));
    constraints.push(where("startedAt", "<=", endOfDay.toISOString()));
  }

  const q = query(
    getUserSessionsCollection(userId),
    ...constraints
  );

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data() as Omit<PumpingSession, 'id'>,
    }));
    callback(sessions);
  });
};

export const subscribeToMonthlySessions = (userId: string, date: Date, callback: (sessions: PumpingSession[]) => void) => {
  // Calculate start and end of the month
  const startOfMonth = new Date(date);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const endOfMonth = new Date(date);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  endOfMonth.setDate(0);
  endOfMonth.setHours(23, 59, 59, 999);

  const q = query(
    getUserSessionsCollection(userId),
    orderBy("startedAt", "desc"),
    where("startedAt", ">=", startOfMonth.toISOString()),
    where("startedAt", "<=", endOfMonth.toISOString())
  );

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data() as Omit<PumpingSession, 'id'>,
    }));
    callback(sessions);
  });
};

export const subscribeToRecentSessions = (userId: string, days: number, callback: (sessions: PumpingSession[]) => void) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const q = query(
    getUserSessionsCollection(userId),
    orderBy("startedAt", "desc"),
    where("startedAt", ">=", startDate.toISOString())
  );

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data() as Omit<PumpingSession, 'id'>,
    }));
    callback(sessions);
  });
};
