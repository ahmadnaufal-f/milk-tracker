import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

export interface GuestMigrationConfig {
  enabled: boolean;
  campaignId: string;
  sourceOriginAllowlist: string[];
  destinationOrigin: string;
}

export interface GuestMigrationGrant {
  transferId: string;
  codeDigest: string;
  sourceUid: string;
  campaignId: string;
  sourceOrigin: string;
  destinationOrigin: string;
  createdAt: number;
  expiresAt: number;
  status: "issued" | "claimed" | "confirmed";
  claimedAt?: number;
  confirmedAt?: number;
}

export interface GuestMigrationStore {
  issueGrant(grant: GuestMigrationGrant, now: number): Promise<void>;
  consumeRedemptionAttempt(rateLimitKey: string, now: number): Promise<void>;
  lookupGrantForRedemption(codeDigest: string): Promise<GuestMigrationGrant>;
  claimGrant(codeDigest: string, now: number, campaignId: string, destinationOrigin: string): Promise<GuestMigrationGrant>;
  confirmGrant(transferId: string, uid: string, now: number): Promise<void>;
}

export interface GuestMigrationDependencies {
  store: GuestMigrationStore;
  createCustomToken: (uid: string, claims: Record<string, unknown>) => Promise<string>;
  verifyGuestSource: (uid: string) => Promise<boolean>;
  now: () => number;
  newCode?: () => string;
  newTransferId?: () => string;
  digestCode?: (code: string) => string;
}

export interface AuthIdentity {
  uid: string | null;
  isGuest: boolean;
  migrationId?: string;
}

export interface CreateGuestMigrationInput {
  campaignId: unknown;
  destinationOrigin: unknown;
}

export interface CreateGuestMigrationResult {
  transferId: string;
  code: string;
  expiresAt: number;
  destinationOrigin: string;
  sourceUid: string;
}

const TRANSFER_TTL_MS = 10 * 60 * 1000;
const CLAIMED_GRANT_RETENTION_MS = 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TRANSFER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function throwHttps(code: ConstructorParameters<typeof HttpsError>[0], message: string): never {
  throw new HttpsError(code, message);
}

function exactHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.origin !== value || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function parseSourceOriginAllowlist(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((entry) => exactHttpsOrigin(entry)).filter((entry): entry is string => !!entry))];
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function makeGuestMigrationDependencies(
  dependencies: GuestMigrationDependencies
): Required<GuestMigrationDependencies> {
  return {
    ...dependencies,
    newCode: dependencies.newCode ?? (() => randomBytes(32).toString("base64url")),
    newTransferId: dependencies.newTransferId ?? randomUUID,
    digestCode: dependencies.digestCode ?? sha256,
  };
}

function validateCampaign(config: GuestMigrationConfig): { sourceOrigins: Set<string>; destinationOrigin: string } {
  if (!config.enabled) throwHttps("failed-precondition", "Guest migration is not enabled.");
  const destinationOrigin = exactHttpsOrigin(config.destinationOrigin);
  const sourceOrigins = new Set(config.sourceOriginAllowlist.map(exactHttpsOrigin).filter((entry): entry is string => !!entry));
  if (!config.campaignId || !destinationOrigin || sourceOrigins.size === 0) {
    throwHttps("failed-precondition", "Guest migration is not configured.");
  }
  if (sourceOrigins.has(destinationOrigin)) {
    throwHttps("failed-precondition", "Guest migration origins are not configured safely.");
  }
  return { sourceOrigins, destinationOrigin };
}

export async function createGuestMigrationCore(
  input: CreateGuestMigrationInput,
  identity: AuthIdentity,
  actualOrigin: string | undefined,
  config: GuestMigrationConfig,
  rawDependencies: GuestMigrationDependencies
): Promise<CreateGuestMigrationResult> {
  const { sourceOrigins, destinationOrigin } = validateCampaign(config);
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => !["campaignId", "destinationOrigin"].includes(key))) {
    throwHttps("invalid-argument", "Request data has unexpected fields.");
  }
  if (!identity.uid) throwHttps("unauthenticated", "Sign in as a guest to create a transfer.");
  if (!identity.isGuest) throwHttps("permission-denied", "Only guest accounts can create a transfer.");
  if (!(await rawDependencies.verifyGuestSource(identity.uid))) {
    throwHttps("permission-denied", "This account is no longer a guest account.");
  }
  if (typeof input.campaignId !== "string" || input.campaignId !== config.campaignId) {
    throwHttps("failed-precondition", "The migration campaign has changed.");
  }
  if (typeof input.destinationOrigin !== "string" || input.destinationOrigin !== destinationOrigin) {
    throwHttps("invalid-argument", "The destination is not available for this campaign.");
  }
  if (!actualOrigin || !sourceOrigins.has(actualOrigin)) {
    throwHttps("permission-denied", "This app origin is not allowed to create a transfer.");
  }

  const dependencies = makeGuestMigrationDependencies(rawDependencies);
  const code = dependencies.newCode();
  if (!CODE_PATTERN.test(code)) throw new Error("Code generator must return a 256-bit base64url code.");
  const transferId = dependencies.newTransferId();
  const now = dependencies.now();
  const grant: GuestMigrationGrant = {
    transferId,
    codeDigest: dependencies.digestCode(code),
    sourceUid: identity.uid,
    campaignId: config.campaignId,
    sourceOrigin: actualOrigin,
    destinationOrigin,
    createdAt: now,
    expiresAt: now + TRANSFER_TTL_MS,
    status: "issued",
  };
  await dependencies.store.issueGrant(grant, now);
  return {
    transferId,
    code,
    expiresAt: grant.expiresAt,
    destinationOrigin,
    sourceUid: identity.uid,
  };
}

export interface RedeemGuestMigrationResult {
  transferId: string;
  customToken: string;
  sourceUid: string;
}

export async function redeemGuestMigrationCore(
  code: unknown,
  actualOrigin: string | undefined,
  actualIp: string | undefined,
  config: GuestMigrationConfig,
  rawDependencies: GuestMigrationDependencies
): Promise<RedeemGuestMigrationResult> {
  const { destinationOrigin } = validateCampaign(config);
  if (!actualOrigin || actualOrigin !== destinationOrigin) {
    throwHttps("permission-denied", "This app origin cannot redeem the transfer.");
  }
  if (typeof code !== "string" || !CODE_PATTERN.test(code)) {
    throwHttps("invalid-argument", "This transfer link is not valid. Create a fresh link in the old app.");
  }

  const dependencies = makeGuestMigrationDependencies(rawDependencies);
  const now = dependencies.now();
  await dependencies.store.consumeRedemptionAttempt(sha256(actualIp?.trim() || "unknown-ip"), now);
  const candidate = await dependencies.store.lookupGrantForRedemption(dependencies.digestCode(code));
  if (candidate.campaignId !== config.campaignId || candidate.destinationOrigin !== destinationOrigin) {
    throwHttps("failed-precondition", "This transfer is not valid for the current campaign.");
  }
  if (!(await dependencies.verifyGuestSource(candidate.sourceUid))) {
    throwHttps("permission-denied", "This guest account is no longer eligible for transfer.");
  }
  const grant = await dependencies.store.claimGrant(dependencies.digestCode(code), now, config.campaignId, destinationOrigin);
  if (grant.sourceUid !== candidate.sourceUid || !(await dependencies.verifyGuestSource(grant.sourceUid))) {
    throwHttps("permission-denied", "This guest account is no longer eligible for transfer.");
  }
  const customToken = await dependencies.createCustomToken(grant.sourceUid, {
    guestMigration: true,
    migrationId: grant.transferId,
  });
  return { transferId: grant.transferId, customToken, sourceUid: grant.sourceUid };
}

export async function confirmGuestMigrationCore(
  transferId: unknown,
  identity: AuthIdentity,
  actualOrigin: string | undefined,
  config: GuestMigrationConfig,
  rawDependencies: GuestMigrationDependencies
): Promise<{ confirmed: true; sourceUid: string }> {
  const { destinationOrigin } = validateCampaign(config);
  if (!identity.uid) throwHttps("unauthenticated", "Sign in with the transferred guest account first.");
  if (typeof transferId !== "string" || !TRANSFER_ID_PATTERN.test(transferId)) {
    throwHttps("invalid-argument", "The transfer identifier is not valid.");
  }
  if (!actualOrigin || actualOrigin !== destinationOrigin) {
    throwHttps("permission-denied", "This app origin cannot confirm the transfer.");
  }
  if (!identity.isGuest || identity.migrationId !== transferId) {
    throwHttps("permission-denied", "This account is not authenticated for this transfer.");
  }
  const dependencies = makeGuestMigrationDependencies(rawDependencies);
  if (!(await dependencies.verifyGuestSource(identity.uid))) {
    throwHttps("permission-denied", "This account is no longer a guest account.");
  }
  await dependencies.store.confirmGrant(transferId, identity.uid, dependencies.now());
  return { confirmed: true, sourceUid: identity.uid };
}

export const guestMigrationConstants = {
  TRANSFER_TTL_MS,
  CLAIMED_GRANT_RETENTION_MS,
  ISSUE_LIMIT: 3,
  ISSUE_WINDOW_MS: 60 * 60 * 1000,
  REDEEM_LIMIT: 20,
  REDEEM_WINDOW_MS: 10 * 60 * 1000,
};
