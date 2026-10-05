import { beforeEach, describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  AuthIdentity,
  GuestMigrationConfig,
  GuestMigrationGrant,
  GuestMigrationStore,
  confirmGuestMigrationCore,
  createGuestMigrationCore,
  redeemGuestMigrationCore,
  sha256,
} from "./guest-migration-core";

const SOURCE_ORIGIN = "https://old.example.test";
const DESTINATION_ORIGIN = "https://pump.arkaes.dev";
const CODE = "A".repeat(43);
const BASE_TIME = Date.UTC(2026, 9, 5, 12);

const enabledConfig: GuestMigrationConfig = {
  enabled: true,
  campaignId: "move-2026",
  sourceOriginAllowlist: [SOURCE_ORIGIN],
  destinationOrigin: DESTINATION_ORIGIN,
};

class MemoryStore implements GuestMigrationStore {
  grants = new Map<string, GuestMigrationGrant>();
  users = new Map<string, { isAnonymous: boolean; lastActive: number; records: unknown[]; cleanupLeaseExpiresAt?: number }>();
  private issuedWindows = new Map<string, { start: number; count: number }>();
  private redeemedWindows = new Map<string, { start: number; count: number }>();
  private claimQueue: Promise<void> = Promise.resolve();

  async issueGrant(grant: GuestMigrationGrant, now: number): Promise<void> {
    const rate = this.issuedWindows.get(grant.sourceUid);
    const profile = this.users.get(grant.sourceUid);
    if (!profile || !profile.isAnonymous) throw new HttpsError("permission-denied", "guest profile required");
    if (profile.cleanupLeaseExpiresAt !== undefined && profile.cleanupLeaseExpiresAt > now) {
      throw new HttpsError("failed-precondition", "cleanup lease active");
    }
    if (rate && now - rate.start < 60 * 60 * 1000 && rate.count >= 3) {
      throw new HttpsError("resource-exhausted", "rate limited");
    }
    this.issuedWindows.set(grant.sourceUid, rate && now - rate.start < 60 * 60 * 1000
      ? { start: rate.start, count: rate.count + 1 }
      : { start: now, count: 1 });
    this.users.set(grant.sourceUid, { ...profile, lastActive: now });
    this.grants.set(grant.transferId, { ...grant });
  }

  async consumeRedemptionAttempt(rateLimitKey: string, now: number): Promise<void> {
    const rate = this.redeemedWindows.get(rateLimitKey);
    if (rate && now - rate.start < 10 * 60 * 1000 && rate.count >= 20) {
      throw new HttpsError("resource-exhausted", "rate limited");
    }
    this.redeemedWindows.set(rateLimitKey, rate && now - rate.start < 10 * 60 * 1000
      ? { start: rate.start, count: rate.count + 1 }
      : { start: now, count: 1 });
  }

  async lookupGrantForRedemption(codeDigest: string): Promise<GuestMigrationGrant> {
    const grant = [...this.grants.values()].find((candidate) => candidate.codeDigest === codeDigest);
    if (!grant) throw new HttpsError("not-found", "invalid");
    return { ...grant };
  }

  async claimGrant(codeDigest: string, now: number, campaignId: string, destinationOrigin: string): Promise<GuestMigrationGrant> {
    let release!: () => void;
    const previous = this.claimQueue;
    this.claimQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const grant = [...this.grants.values()].find((candidate) => candidate.codeDigest === codeDigest);
      if (!grant) throw new HttpsError("not-found", "invalid");
      const profile = this.users.get(grant.sourceUid);
      if (!profile || !profile.isAnonymous ||
        profile.cleanupLeaseExpiresAt !== undefined && profile.cleanupLeaseExpiresAt > now) {
        throw new HttpsError("permission-denied", "source is not eligible");
      }
      if (grant.expiresAt <= now && grant.status === "issued") {
        throw new HttpsError("deadline-exceeded", "expired");
      }
      if (grant.status !== "issued") {
        throw new HttpsError("failed-precondition", "used");
      }
      if (grant.campaignId !== campaignId || grant.destinationOrigin !== destinationOrigin) {
        throw new HttpsError("failed-precondition", "stale campaign");
      }
      const claimed = { ...grant, status: "claimed" as const, claimedAt: now, expiresAt: now + 24 * 60 * 60 * 1000 };
      this.grants.set(grant.transferId, claimed);
      return { ...claimed };
    } finally {
      release();
    }
  }

  async confirmGrant(transferId: string, uid: string, now: number): Promise<void> {
    const grant = this.grants.get(transferId);
    const profile = this.users.get(uid);
    if (!grant || grant.sourceUid !== uid || (grant.status !== "claimed" && grant.status !== "confirmed") ||
      !profile?.isAnonymous || profile.cleanupLeaseExpiresAt !== undefined && profile.cleanupLeaseExpiresAt > now) {
      throw new HttpsError("permission-denied", "not confirmed");
    }
    if (grant.expiresAt <= now) throw new HttpsError("deadline-exceeded", "receipt expired");
    if (grant.status === "claimed") this.grants.set(transferId, {
      ...grant,
      status: "confirmed",
      confirmedAt: now,
      expiresAt: now + 60 * 60 * 1000,
    });
    this.users.set(uid, { ...profile, lastActive: now });
  }
}

describe("guest migration backend core", () => {
  let now: number;
  let store: MemoryStore;
  let signed: Array<{ uid: string; claims: Record<string, unknown> }>;
  let token: string;

  const guest: AuthIdentity = { uid: "source-uid", isGuest: true };
  const dependencies = () => ({
    store,
    now: () => now,
    newCode: () => CODE,
    newTransferId: () => "transfer-1",
    digestCode: sha256,
    createCustomToken: async (uid: string, claims: Record<string, unknown>) => {
      signed.push({ uid, claims });
      return token;
    },
    verifyGuestSource: async (uid: string) => store.users.get(uid)?.isAnonymous === true,
  });

  beforeEach(() => {
    now = BASE_TIME;
    store = new MemoryStore();
    signed = [];
    token = "custom-token-for-source";
    store.users.set("source-uid", { isAnonymous: true, lastActive: BASE_TIME - 100_000_000, records: [{ id: "session-1", volume: 80 }] });
  });

  it("issues only for the authenticated guest UID and stores only the code digest", async () => {
    const result = await createGuestMigrationCore(
      { campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN },
      guest,
      SOURCE_ORIGIN,
      enabledConfig,
      dependencies()
    );

    expect(result).toEqual({
      transferId: "transfer-1",
      code: CODE,
      expiresAt: BASE_TIME + 10 * 60 * 1000,
      destinationOrigin: DESTINATION_ORIGIN,
      sourceUid: "source-uid",
    });
    expect(store.grants.get("transfer-1")).toMatchObject({ sourceUid: "source-uid", codeDigest: sha256(CODE), status: "issued" });
    expect(JSON.stringify([...store.grants.values()])).not.toContain(CODE);
    expect(store.users.get("source-uid")).toMatchObject({ isAnonymous: true, lastActive: BASE_TIME });
  });

  it("rejects unauthenticated, non-guest, spoofed UID, and arbitrary destination issuance", async () => {
    const input = { campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN };
    await expect(createGuestMigrationCore(input, { uid: null, isGuest: false }, SOURCE_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "unauthenticated" });
    await expect(createGuestMigrationCore(input, { uid: "google-uid", isGuest: false }, SOURCE_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(createGuestMigrationCore({ ...input, userId: "attacker-uid" } as typeof input, guest, SOURCE_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(createGuestMigrationCore({ ...input, destinationOrigin: "https://attacker.test" }, guest, SOURCE_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "invalid-argument" });
    expect(store.grants.size).toBe(0);
  });

  it("rejects disabled campaigns, unlisted source origins, and campaign mismatches", async () => {
    const input = { campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN };
    await expect(createGuestMigrationCore(input, guest, SOURCE_ORIGIN, { ...enabledConfig, enabled: false }, dependencies()))
      .rejects.toMatchObject({ code: "failed-precondition" });
    await expect(createGuestMigrationCore(input, guest, "https://preview.example.test", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(createGuestMigrationCore({ ...input, campaignId: "old-campaign" }, guest, SOURCE_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("mints the custom token only for the UID stored in the claimed grant", async () => {
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    const result = await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies());
    expect(result).toEqual({ transferId: "transfer-1", customToken: token, sourceUid: "source-uid" });
    expect(signed).toEqual([{ uid: "source-uid", claims: { guestMigration: true, migrationId: "transfer-1" } }]);
  });

  it("does not redeem or mint a token after the source has linked a Google account", async () => {
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    store.users.set("source-uid", { isAnonymous: false, lastActive: now, records: [] });

    await expect(redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect(store.grants.get("transfer-1")?.status).toBe("issued");
    expect(signed).toEqual([]);
  });

  it("rejects redemption when the profile links after preflight but before the claim transaction", async () => {
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    const originalClaim = store.claimGrant.bind(store);
    store.claimGrant = async (...args) => {
      store.users.set("source-uid", { isAnonymous: false, lastActive: now, records: [] });
      return originalClaim(...args);
    };

    await expect(redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "permission-denied" });
    expect(store.grants.get("transfer-1")?.status).toBe("issued");
    expect(signed).toEqual([]);
  });

  it("rejects invalid, expired, and replayed codes", async () => {
    await expect(redeemGuestMigrationCore("wrong", DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    now += 10 * 60 * 1000;
    await expect(redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "deadline-exceeded" });

    now = BASE_TIME;
    store = new MemoryStore();
    store.users.set("source-uid", { isAnonymous: true, lastActive: BASE_TIME, records: [] });
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies());
    await expect(redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("allows at most one concurrent redemption", async () => {
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    const results = await Promise.allSettled([
      redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()),
      redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.2", enabledConfig, dependencies()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(signed).toHaveLength(1);
  });

  it("requires the transferred UID and verified migration claim to confirm, then retries idempotently", async () => {
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies());
    await expect(confirmGuestMigrationCore("bad/transfer", { uid: "source-uid", isGuest: true, migrationId: "bad/transfer" }, DESTINATION_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "invalid-argument" });
    await expect(confirmGuestMigrationCore("transfer-1", { uid: "other-uid", isGuest: true, migrationId: "transfer-1" }, DESTINATION_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "permission-denied" });
    await expect(confirmGuestMigrationCore("transfer-1", { uid: "source-uid", isGuest: false, migrationId: "transfer-1" }, DESTINATION_ORIGIN, enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "permission-denied" });

    const recordsBefore = structuredClone(store.users.get("source-uid")?.records);
    expect(await confirmGuestMigrationCore("transfer-1", { uid: "source-uid", isGuest: true, migrationId: "transfer-1" }, DESTINATION_ORIGIN, enabledConfig, dependencies()))
      .toEqual({ confirmed: true, sourceUid: "source-uid" });
    now += 500;
    await confirmGuestMigrationCore("transfer-1", { uid: "source-uid", isGuest: true, migrationId: "transfer-1" }, DESTINATION_ORIGIN, enabledConfig, dependencies());
    expect(store.grants.get("transfer-1")?.status).toBe("confirmed");
    expect(store.users.get("source-uid")?.records).toEqual(recordsBefore);
    expect(store.users.get("source-uid")?.lastActive).toBe(now);
  });

  it("allows confirmation after the ten-minute code expires while the claimed receipt is live", async () => {
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    now += 9 * 60 * 1000;
    await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies());
    now += 2 * 60 * 1000;

    await expect(confirmGuestMigrationCore(
      "transfer-1",
      { uid: "source-uid", isGuest: true, migrationId: "transfer-1" },
      DESTINATION_ORIGIN,
      enabledConfig,
      dependencies()
    )).resolves.toEqual({ confirmed: true, sourceUid: "source-uid" });
    expect(store.grants.get("transfer-1")?.status).toBe("confirmed");
  });

  it("requires a fresh link after the claimed receipt expires", async () => {
    const firstDependencies = { ...dependencies(), newTransferId: () => "transfer-1" };
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, firstDependencies);
    await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, firstDependencies);
    now += 24 * 60 * 60 * 1000 + 1;
    await expect(confirmGuestMigrationCore(
      "transfer-1",
      { uid: "source-uid", isGuest: true, migrationId: "transfer-1" },
      DESTINATION_ORIGIN,
      enabledConfig,
      firstDependencies
    )).rejects.toMatchObject({ code: "deadline-exceeded" });

    const secondCode = "C".repeat(43);
    const secondDependencies = {
      ...dependencies(),
      newCode: () => secondCode,
      newTransferId: () => "transfer-2",
    };
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, secondDependencies);
    await redeemGuestMigrationCore(secondCode, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, secondDependencies);
    await expect(confirmGuestMigrationCore(
      "transfer-2",
      { uid: "source-uid", isGuest: true, migrationId: "transfer-2" },
      DESTINATION_ORIGIN,
      enabledConfig,
      secondDependencies
    )).resolves.toEqual({ confirmed: true, sourceUid: "source-uid" });
  });

  it("does not let a stale guest claim revive a Google-linked profile", async () => {
    store.users.set("source-uid", { isAnonymous: false, lastActive: BASE_TIME, records: [] });
    const staleClaim: AuthIdentity = { uid: "source-uid", isGuest: true, migrationId: "transfer-1" };
    await expect(createGuestMigrationCore(
      { campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN },
      staleClaim,
      SOURCE_ORIGIN,
      enabledConfig,
      dependencies()
    )).rejects.toMatchObject({ code: "permission-denied" });

    store.users.set("source-uid", { isAnonymous: true, lastActive: BASE_TIME, records: [] });
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies());
    store.users.set("source-uid", { isAnonymous: false, lastActive: now, records: [] });
    await expect(confirmGuestMigrationCore(
      "transfer-1",
      staleClaim,
      DESTINATION_ORIGIN,
      enabledConfig,
      dependencies()
    )).rejects.toMatchObject({ code: "permission-denied" });
    expect(store.users.get("source-uid")?.isAnonymous).toBe(false);
    expect(store.grants.get("transfer-1")?.status).toBe("claimed");
  });

  it("counts well-formed invalid redemption attempts against the IP limit", async () => {
    const invalidCode = "B".repeat(43);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(redeemGuestMigrationCore(invalidCode, DESTINATION_ORIGIN, "192.0.2.44", enabledConfig, dependencies()))
        .rejects.toMatchObject({ code: "not-found" });
    }
    await expect(redeemGuestMigrationCore(invalidCode, DESTINATION_ORIGIN, "192.0.2.44", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("preserves all source records on failed and successful paths", async () => {
    const records = [{ id: "session-1", volume: 80 }, { id: "session-2", volume: 125 }];
    store.users.set("source-uid", { isAnonymous: true, lastActive: BASE_TIME, records: structuredClone(records) });
    await expect(redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies()))
      .rejects.toMatchObject({ code: "not-found" });
    await createGuestMigrationCore({ campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN }, guest, SOURCE_ORIGIN, enabledConfig, dependencies());
    await redeemGuestMigrationCore(CODE, DESTINATION_ORIGIN, "192.0.2.1", enabledConfig, dependencies());
    expect(store.users.get("source-uid")?.records).toEqual(records);
  });

  it("enforces per-guest issuance limits", async () => {
    const nextDependencies = (id: string) => ({ ...dependencies(), newTransferId: () => id });
    for (let index = 0; index < 3; index += 1) {
      await createGuestMigrationCore(
        { campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN },
        guest,
        SOURCE_ORIGIN,
        enabledConfig,
        nextDependencies(`transfer-${index}`)
      );
    }
    await expect(createGuestMigrationCore(
      { campaignId: "move-2026", destinationOrigin: DESTINATION_ORIGIN },
      guest,
      SOURCE_ORIGIN,
      enabledConfig,
      nextDependencies("transfer-over-limit")
    )).rejects.toMatchObject({ code: "resource-exhausted" });
  });
});
