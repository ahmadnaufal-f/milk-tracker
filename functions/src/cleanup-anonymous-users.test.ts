import { describe, expect, it } from "vitest";
import {
  AnonymousCleanupRepository,
  AnonymousUserState,
  ANONYMOUS_RETENTION_MS,
  cleanupInactiveAnonymousUsers,
} from "./cleanup-anonymous-users-core";

const NOW = Date.UTC(2026, 9, 5, 12);

class MemoryCleanupRepository implements AnonymousCleanupRepository {
  candidates: string[] = [];
  users = new Map<string, AnonymousUserState & { leaseId?: string; leaseExpiresAt?: number }>();
  activeTransfers = new Set<string>();
  linkedAuthUsers = new Set<string>();
  deletedData: string[] = [];
  deletedAuth: string[] = [];
  private nextLeaseId = 0;

  async findInactiveAnonymousUsers(): Promise<string[]> {
    return [...this.candidates];
  }

  async getUser(uid: string): Promise<AnonymousUserState | null> {
    const user = this.users.get(uid);
    return user ? { uid: user.uid, isAnonymous: user.isAnonymous, lastActive: user.lastActive } : null;
  }

  async isAuthUserUnlinked(uid: string): Promise<boolean> {
    return !this.linkedAuthUsers.has(uid);
  }

  async claimCleanup(uid: string, cutoff: number, now: number): Promise<string | null> {
    const user = this.users.get(uid);
    if (!user || !user.isAnonymous || user.lastActive === null || user.lastActive > cutoff ||
      user.leaseExpiresAt !== undefined && user.leaseExpiresAt > now || this.activeTransfers.has(uid)) return null;
    user.leaseId = `cleanup-${++this.nextLeaseId}`;
    user.leaseExpiresAt = now + 10 * 60 * 1000;
    return user.leaseId;
  }

  async releaseCleanup(uid: string, leaseId: string): Promise<void> {
    const user = this.users.get(uid);
    if (user?.leaseId !== leaseId) return;
    delete user.leaseId;
    delete user.leaseExpiresAt;
  }

  async deleteUserData(uid: string, leaseId: string, cutoff: number): Promise<void> {
    const user = this.users.get(uid);
    if (!user || user.leaseId !== leaseId || !user.isAnonymous || user.lastActive === null ||
      user.lastActive > cutoff || this.activeTransfers.has(uid)) throw new Error("eligibility changed");
    this.deletedData.push(uid);
    this.users.delete(uid);
  }

  async deleteAuthUser(uid: string): Promise<void> {
    this.deletedAuth.push(uid);
  }

  /** Models issueGrant's transaction against the same profile and cleanup lease. */
  async issueGuestTransfer(uid: string, now: number): Promise<boolean> {
    const user = this.users.get(uid);
    if (!user || !user.isAnonymous || user.leaseExpiresAt !== undefined && user.leaseExpiresAt > now) return false;
    user.lastActive = now;
    this.activeTransfers.add(uid);
    return true;
  }
}

function addInactive(repository: MemoryCleanupRepository, uid: string): void {
  repository.candidates.push(uid);
  repository.users.set(uid, { uid, isAnonymous: true, lastActive: NOW - ANONYMOUS_RETENTION_MS });
}

describe("cleanupInactiveAnonymousUsers", () => {
  it("keeps the existing 30-day policy for genuinely inactive guests", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "inactive-guest");

    const deleted = await cleanupInactiveAnonymousUsers(repository, NOW);

    expect(deleted).toEqual(["inactive-guest"]);
    expect(repository.deletedData).toEqual(["inactive-guest"]);
    expect(repository.deletedAuth).toEqual(["inactive-guest"]);
  });

  it("skips a guest whose lastActive was refreshed after the initial query", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "recent-guest");
    await repository.issueGuestTransfer("recent-guest", NOW);

    expect(await cleanupInactiveAnonymousUsers(repository, NOW)).toEqual([]);
    expect(repository.deletedData).toEqual([]);
  });

  it("protects a guest with an in-progress transfer", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "transferring-guest");
    repository.activeTransfers.add("transferring-guest");

    expect(await cleanupInactiveAnonymousUsers(repository, NOW)).toEqual([]);
    expect(repository.deletedData).toEqual([]);
  });

  it("does not delete a Google-linked account when its Firestore guest flag is stale", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "linked-account");
    repository.linkedAuthUsers.add("linked-account");

    expect(await cleanupInactiveAnonymousUsers(repository, NOW)).toEqual([]);
    expect(repository.deletedData).toEqual([]);
    expect(repository.deletedAuth).toEqual([]);
  });

  it("rechecks Auth provider state after leasing before deleting data", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "just-linked");
    let checks = 0;
    repository.isAuthUserUnlinked = async () => {
      checks += 1;
      return checks === 1;
    };

    expect(await cleanupInactiveAnonymousUsers(repository, NOW)).toEqual([]);
    expect(checks).toBe(2);
    expect(repository.deletedData).toEqual([]);
    expect(repository.users.get("just-linked")?.leaseId).toBeUndefined();
  });

  it("does not delete records if the source identity changes after the initial query", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "no-longer-guest");
    repository.users.get("no-longer-guest")!.isAnonymous = false;

    expect(await cleanupInactiveAnonymousUsers(repository, NOW)).toEqual([]);
    expect(repository.deletedData).toEqual([]);
  });

  it("serializes cleanup and transfer issuance whichever transaction wins", async () => {
    const cleanupWins = new MemoryCleanupRepository();
    addInactive(cleanupWins, "cleanup-first");
    const leaseId = await cleanupWins.claimCleanup("cleanup-first", NOW - ANONYMOUS_RETENTION_MS, NOW);
    expect(leaseId).toBeTruthy();
    expect(await cleanupWins.issueGuestTransfer("cleanup-first", NOW)).toBe(false);
    expect(await cleanupInactiveAnonymousUsers(cleanupWins, NOW)).toEqual([]);

    const issuanceWins = new MemoryCleanupRepository();
    addInactive(issuanceWins, "issue-first");
    expect(await issuanceWins.issueGuestTransfer("issue-first", NOW)).toBe(true);
    expect(await cleanupInactiveAnonymousUsers(issuanceWins, NOW)).toEqual([]);
    expect(issuanceWins.deletedData).toEqual([]);
  });

  it("releases the lease if eligibility changes during a delete batch", async () => {
    const repository = new MemoryCleanupRepository();
    addInactive(repository, "changed-during-delete");
    repository.deleteUserData = async (_uid, leaseId) => {
      await repository.releaseCleanup("changed-during-delete", leaseId);
      throw new Error("lastActive changed while deleting");
    };

    await expect(cleanupInactiveAnonymousUsers(repository, NOW)).rejects.toMatchObject({ name: "CleanupLeaseLostError" });
    expect(repository.users.get("changed-during-delete")?.leaseId).toBeUndefined();
    expect(repository.deletedAuth).toEqual([]);
  });
});
