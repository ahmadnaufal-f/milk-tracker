export interface AnonymousUserState {
  uid: string;
  isAnonymous: boolean;
  lastActive: number | null;
}

export interface AnonymousCleanupRepository {
  findInactiveAnonymousUsers(cutoff: number): Promise<string[]>;
  getUser(uid: string): Promise<AnonymousUserState | null>;
  isAuthUserUnlinked(uid: string): Promise<boolean>;
  claimCleanup(uid: string, cutoff: number, now: number): Promise<string | null>;
  releaseCleanup(uid: string, leaseId: string): Promise<void>;
  deleteUserData(uid: string, leaseId: string, cutoff: number): Promise<void>;
  deleteAuthUser(uid: string): Promise<void>;
}

export const ANONYMOUS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export class CleanupLeaseLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CleanupLeaseLostError";
  }
}

/**
 * Remove only guests who still meet the retention rule at the final check.
 * Issuance and confirmation refresh lastActive; live grants are checked too.
 */
export async function cleanupInactiveAnonymousUsers(
  repository: AnonymousCleanupRepository,
  now: number
): Promise<string[]> {
  const cutoff = now - ANONYMOUS_RETENTION_MS;
  const candidateUids = await repository.findInactiveAnonymousUsers(cutoff);
  const deleted: string[] = [];

  for (const uid of candidateUids) {
    if (!(await repository.isAuthUserUnlinked(uid))) continue;
    // The transaction rechecks recency and live grants while setting a lease.
    // Issue/confirm use the same user document, so they serialize with cleanup.
    const leaseId = await repository.claimCleanup(uid, cutoff, now);
    if (!leaseId) continue;
    try {
      const current = await repository.getUser(uid);
      if (!current || !current.isAnonymous || current.lastActive === null || current.lastActive > cutoff ||
        !(await repository.isAuthUserUnlinked(uid))) {
        await repository.releaseCleanup(uid, leaseId);
        continue;
      }
      await repository.deleteUserData(uid, leaseId, cutoff);
    } catch {
      await repository.releaseCleanup(uid, leaseId);
      throw new CleanupLeaseLostError("Cleanup stopped because eligibility changed or the lease was lost.");
    }

    try {
      // Check Auth again after Firestore deletion; the adapter rechecks just
      // before deleteUser as well because Auth and Firestore do not share a transaction.
      if (await repository.isAuthUserUnlinked(uid)) await repository.deleteAuthUser(uid);
    } catch {
      // Preserve the prior cleanup policy: Firestore data can be removed even
      // if Auth has already removed the account or cannot remove it now.
    }
    deleted.push(uid);
  }

  return deleted;
}
