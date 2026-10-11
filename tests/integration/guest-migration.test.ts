import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  EmailAuthProvider,
  getAuth,
  getIdToken,
  getIdTokenResult,
  linkWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  type Auth,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  setDoc,
  Timestamp,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-milk-tracker-migration";
const CAMPAIGN_ID = "migration-emulator-v1";
const SOURCE_ORIGIN = "https://old.example.test";
const DESTINATION_ORIGIN = "https://pump.arkaes.dev";
const FIREBASE_API_KEY = "demo-api-key";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_EMULATOR_PORT = 8080;
const FUNCTIONS_EMULATOR_URL = "http://127.0.0.1:5001";
const FUNCTIONS_REGION = "asia-southeast1";

// The Functions emulator enables firebase-functions' documented debug token
// verification bypass. This unsigned value is sent only to its localhost
// endpoint; App Check enforcement remains enabled by the production callable.
const EMULATOR_APP_CHECK_TOKEN =
  "e30.eyJzdWIiOiJkZW1vLWd1ZXN0LW1pZ3JhdGlvbi1hcHAifQ.c2ln";

interface CallableFailure {
  status?: string;
  message?: string;
}

class CallableError extends Error {
  constructor(readonly status: string, message: string) {
    super(message);
    this.name = "CallableError";
  }
}

function firebaseOptions() {
  return {
    apiKey: FIREBASE_API_KEY,
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
    appId: "1:123456789:web:guest-migration-emulator",
  };
}

function createClient(label: string): { app: FirebaseApp; auth: Auth; db: Firestore } {
  const app = initializeApp(firebaseOptions(), `${label}-${randomUUID()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  connectFirestoreEmulator(db, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
  return { app, auth, db };
}

async function callMigrationCallable<T>(options: {
  name: "createGuestMigration" | "redeemGuestMigration" | "confirmGuestMigration";
  data: Record<string, unknown>;
  origin: string;
  auth?: Auth;
}): Promise<T> {
  const user = options.auth?.currentUser;
  const response = await fetch(
    `${FUNCTIONS_EMULATOR_URL}/${PROJECT_ID}/${FUNCTIONS_REGION}/${options.name}`,
    {
      method: "POST",
      headers: {
        Origin: options.origin,
        "Content-Type": "application/json",
        "X-Firebase-AppCheck": EMULATOR_APP_CHECK_TOKEN,
        ...(user ? { Authorization: `Bearer ${await getIdToken(user)}` } : {}),
      },
      body: JSON.stringify({ data: options.data }),
    }
  );

  const payload = (await response.json()) as {
    result?: T;
    error?: CallableFailure;
  };
  if (!response.ok || payload.error) {
    throw new CallableError(
      payload.error?.status ?? `HTTP_${response.status}`,
      payload.error?.message ?? `Callable ${options.name} failed.`
    );
  }
  if (!Object.hasOwn(payload, "result")) {
    throw new Error(`Callable ${options.name} returned no result.`);
  }
  return payload.result as T;
}

async function seedGuest(db: Firestore, auth: Auth) {
  const { user } = await signInAnonymously(auth);
  const uid = user.uid;
  const createdAt = Timestamp.fromDate(new Date("2026-09-01T08:00:00.000Z"));
  const lastActive = Timestamp.fromDate(new Date("2026-10-01T09:30:00.000Z"));

  await setDoc(doc(db, "users", uid), {
    isAnonymous: true,
    createdAt,
    lastActive,
    targetVolume: "120",
    targetDuration: "25",
    reminderHours: "4",
    aiContext: {
      enabled: true,
      babyBirthdate: "2026-02-14",
      feedingMethod: "supplemental",
      pumpingGoal: {
        freezerStash: true,
        maintainingSupply: false,
        increasingSupply: true,
        returningToWork: false,
        weaning: false,
      },
    },
    fcmToken: "emulator-seed-token",
  });

  const sessions = [
    {
      id: "session-before-dawn",
      volume: 82,
      duration: 21,
      startedAt: "2026-09-28T04:45:00.000Z",
      createdAt: Timestamp.fromDate(new Date("2026-09-28T05:06:00.000Z")),
    },
    {
      id: "session-lunch",
      volume: 107.5,
      duration: 18,
      startedAt: "2026-09-29T12:20:00.000Z",
      createdAt: Timestamp.fromDate(new Date("2026-09-29T12:38:00.000Z")),
    },
    {
      id: "session-evening",
      volume: 95,
      duration: 24,
      startedAt: "2026-09-30T19:10:00.000Z",
      createdAt: Timestamp.fromDate(new Date("2026-09-30T19:34:00.000Z")),
    },
  ];
  await Promise.all(
    sessions.map(({ id, ...data }) =>
      setDoc(doc(db, "users", uid, "sessions", id), data)
    )
  );

  const reminders = [
    {
      id: "existing-reminder",
      sessionId: "session-evening",
      scheduledFor: "2026-10-01T00:00:00.000Z",
      message: "Existing reminder remains unchanged",
      sent: false,
      createdAt: Timestamp.fromDate(new Date("2026-09-30T19:34:01.000Z")),
    },
  ];
  await Promise.all(
    reminders.map(({ id, ...data }) =>
      setDoc(doc(db, "users", uid, "reminders", id), data)
    )
  );

  return { uid, sessions, reminders };
}

async function readUserSnapshot(db: Firestore, uid: string) {
  const userSnapshot = await getDocFromServer(doc(db, "users", uid));
  if (!userSnapshot.exists()) throw new Error("Expected seeded user document is missing.");
  const [sessionsSnapshot, remindersSnapshot] = await Promise.all([
    getDocsFromServer(collection(db, "users", uid, "sessions")),
    getDocsFromServer(collection(db, "users", uid, "reminders")),
  ]);
  const byId = (snapshot: typeof sessionsSnapshot) =>
    snapshot.docs
      .map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort((left, right) => left.id.localeCompare(right.id));
  return {
    user: userSnapshot.data(),
    sessions: byId(sessionsSnapshot),
    reminders: byId(remindersSnapshot),
  };
}

describe("guest migration Firebase emulator integration", () => {
  let source: ReturnType<typeof createClient>;
  let unrelated: ReturnType<typeof createClient>;
  let destination: ReturnType<typeof createClient>;
  let linkedLogin: ReturnType<typeof createClient>;
  let sourceSeed: Awaited<ReturnType<typeof seedGuest>>;
  let unrelatedSeed: Awaited<ReturnType<typeof seedGuest>>;

  beforeAll(async () => {
    if (process.env.GCLOUD_PROJECT !== PROJECT_ID) {
      throw new Error(
        `Refusing to contact Firebase: GCLOUD_PROJECT must be ${PROJECT_ID}.`
      );
    }
    source = createClient("source");
    unrelated = createClient("unrelated");
    destination = createClient("destination");
    linkedLogin = createClient("linked-login");
    sourceSeed = await seedGuest(source.db, source.auth);
    unrelatedSeed = await seedGuest(unrelated.db, unrelated.auth);
  });

  afterAll(async () => {
    await Promise.allSettled(
      [source, unrelated, destination, linkedLogin]
        .filter(Boolean)
        .map(({ app }) => deleteApp(app))
    );
  });

  it("authenticates the source UID, preserves every record, and enforces single-use access and Firestore rules", async () => {
    const sourceBefore = await readUserSnapshot(source.db, sourceSeed.uid);
    const unrelatedBefore = await readUserSnapshot(unrelated.db, unrelatedSeed.uid);
    expect(sourceBefore.sessions).toHaveLength(3);
    expect(sourceBefore.reminders).toHaveLength(1);

    const issued = await callMigrationCallable<{
      transferId: string;
      code: string;
      expiresAt: number;
      destinationOrigin: string;
      sourceUid: string;
    }>({
      name: "createGuestMigration",
      data: { campaignId: CAMPAIGN_ID, destinationOrigin: DESTINATION_ORIGIN },
      origin: SOURCE_ORIGIN,
      auth: source.auth,
    });

    expect(issued.sourceUid).toBe(sourceSeed.uid);
    expect(issued.destinationOrigin).toBe(DESTINATION_ORIGIN);
    expect(issued.expiresAt).toBeGreaterThan(Date.now());
    expect(issued.expiresAt).toBeLessThanOrEqual(Date.now() + 11 * 60 * 1000);
    expect(typeof issued.transferId).toBe("string");

    await expect(
      callMigrationCallable({
        name: "redeemGuestMigration",
        data: { code: `${issued.code.slice(0, -1)}${issued.code.endsWith("A") ? "B" : "A"}` },
        origin: DESTINATION_ORIGIN,
      })
    ).rejects.toBeInstanceOf(CallableError);

    const concurrentClaims = await Promise.allSettled([
      callMigrationCallable<{
        transferId: string;
        customToken: string;
        sourceUid: string;
      }>({
        name: "redeemGuestMigration",
        data: { code: issued.code },
        origin: DESTINATION_ORIGIN,
      }),
      callMigrationCallable<{
        transferId: string;
        customToken: string;
        sourceUid: string;
      }>({
        name: "redeemGuestMigration",
        data: { code: issued.code },
        origin: DESTINATION_ORIGIN,
      }),
    ]);
    const successfulClaims = concurrentClaims.filter(
      (claim): claim is PromiseFulfilledResult<{
        transferId: string;
        customToken: string;
        sourceUid: string;
      }> => claim.status === "fulfilled"
    );
    expect(successfulClaims).toHaveLength(1);
    const redeemed = successfulClaims[0].value;
    expect(redeemed.transferId).toBe(issued.transferId);
    expect(redeemed.sourceUid).toBe(sourceSeed.uid);

    const destinationCredential = await signInWithCustomToken(
      destination.auth,
      redeemed.customToken
    );
    expect(destinationCredential.user.uid).toBe(sourceSeed.uid);
    const refreshedMigrationToken = await getIdTokenResult(
      destinationCredential.user,
      true
    );
    expect(refreshedMigrationToken.claims).toMatchObject({
      guestMigration: true,
      migrationId: issued.transferId,
    });
    expect(refreshedMigrationToken.signInProvider).toBe("custom");

    const destinationData = await readUserSnapshot(destination.db, destinationCredential.user.uid);
    const omitActivity = (user: Record<string, unknown>) => {
      const { lastActive: _lastActive, ...stableData } = user;
      return stableData;
    };
    expect(omitActivity(destinationData.user)).toEqual(omitActivity(sourceBefore.user));
    expect(destinationData.sessions).toEqual(sourceBefore.sessions);
    expect(destinationData.reminders).toEqual(sourceBefore.reminders);

    const destinationAuthUser = destination.auth.currentUser;
    expect(destinationAuthUser).not.toBeNull();
    const confirmed = await callMigrationCallable<{ confirmed: true; sourceUid: string }>({
      name: "confirmGuestMigration",
      data: { transferId: issued.transferId },
      origin: DESTINATION_ORIGIN,
      auth: destination.auth,
    });
    expect(confirmed).toEqual({ confirmed: true, sourceUid: sourceSeed.uid });
    await expect(
      callMigrationCallable({
        name: "confirmGuestMigration",
        data: { transferId: issued.transferId },
        origin: DESTINATION_ORIGIN,
        auth: destination.auth,
      })
    ).resolves.toEqual({ confirmed: true, sourceUid: sourceSeed.uid });

    await expect(
      callMigrationCallable({
        name: "confirmGuestMigration",
        data: { transferId: issued.transferId },
        origin: DESTINATION_ORIGIN,
        auth: unrelated.auth,
      })
    ).rejects.toBeInstanceOf(CallableError);

    const sourceAfter = await readUserSnapshot(source.db, sourceSeed.uid);
    const unrelatedAfter = await readUserSnapshot(unrelated.db, unrelatedSeed.uid);
    expect(omitActivity(sourceAfter.user)).toEqual(omitActivity(sourceBefore.user));
    expect(sourceAfter.sessions).toEqual(sourceBefore.sessions);
    expect(sourceAfter.reminders).toEqual(sourceBefore.reminders);
    expect(sourceAfter.user.isAnonymous).toBe(true);
    expect((sourceAfter.user.lastActive as Timestamp).toMillis()).toBeGreaterThan(
      (sourceBefore.user.lastActive as Timestamp).toMillis()
    );
    expect(unrelatedAfter).toEqual(unrelatedBefore);

    await expect(
      callMigrationCallable({
        name: "redeemGuestMigration",
        data: { code: issued.code },
        origin: DESTINATION_ORIGIN,
      })
    ).rejects.toBeInstanceOf(CallableError);

    await expect(
      getDocFromServer(doc(destination.db, "users", unrelatedSeed.uid))
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      getDocsFromServer(collection(destination.db, "users", unrelatedSeed.uid, "sessions"))
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      getDocFromServer(doc(destination.db, "guestMigrations", issued.transferId))
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      getDocFromServer(doc(source.db, "guestMigrations", issued.transferId))
    ).rejects.toMatchObject({ code: "permission-denied" });

    const sameUidUser = await getDocFromServer(
      doc(destination.db, "users", sourceSeed.uid)
    );
    expect(sameUidUser.exists()).toBe(true);
    expect((await getDocsFromServer(collection(destination.db, "users", sourceSeed.uid, "sessions"))).size).toBe(3);
    expect((await getDocsFromServer(collection(destination.db, "users", sourceSeed.uid, "reminders"))).size).toBe(1);
    expect((await getDocFromServer(doc(source.db, "users", sourceSeed.uid))).exists()).toBe(true);

    const linkedProfileCode = await callMigrationCallable<{
      transferId: string;
      code: string;
      expiresAt: number;
      destinationOrigin: string;
      sourceUid: string;
    }>({
      name: "createGuestMigration",
      data: { campaignId: CAMPAIGN_ID, destinationOrigin: DESTINATION_ORIGIN },
      origin: SOURCE_ORIGIN,
      auth: source.auth,
    });
    expect(linkedProfileCode.sourceUid).toBe(sourceSeed.uid);

    const anonymousSource = source.auth.currentUser;
    expect(anonymousSource).not.toBeNull();
    const linkedSource = await linkWithCredential(
      anonymousSource!,
      EmailAuthProvider.credential(
        "linked-guest@example.test",
        "milk-tracker-emulator-password"
      )
    );
    expect(linkedSource.user.uid).toBe(sourceSeed.uid);
    expect(linkedSource.user.isAnonymous).toBe(false);
    await setDoc(
      doc(source.db, "users", sourceSeed.uid),
      { isAnonymous: false },
      { merge: true }
    );

    const linkedLoginCredential = await signInWithEmailAndPassword(
      linkedLogin.auth,
      "linked-guest@example.test",
      "milk-tracker-emulator-password"
    );
    expect(linkedLoginCredential.user.uid).toBe(sourceSeed.uid);
    expect(linkedLoginCredential.user.isAnonymous).toBe(false);
    const linkedTokenAfterRefresh = await getIdTokenResult(
      linkedLoginCredential.user,
      true
    );
    expect(linkedTokenAfterRefresh.signInProvider).toBe("password");
    if (linkedTokenAfterRefresh.claims.guestMigration === true) {
      expect(linkedTokenAfterRefresh.claims.migrationId).toBe(issued.transferId);
    }

    const profileAfterLink = await readUserSnapshot(source.db, sourceSeed.uid);
    const omitGuestMetadata = (user: Record<string, unknown>) => {
      const { isAnonymous: _isAnonymous, lastActive: _lastActive, ...stableData } = user;
      return stableData;
    };
    expect(profileAfterLink.user.isAnonymous).toBe(false);
    expect(omitGuestMetadata(profileAfterLink.user)).toEqual(
      omitGuestMetadata(sourceBefore.user)
    );
    expect(profileAfterLink.sessions).toEqual(sourceBefore.sessions);
    expect(profileAfterLink.reminders).toEqual(sourceBefore.reminders);

    await expect(
      callMigrationCallable({
        name: "redeemGuestMigration",
        data: { code: linkedProfileCode.code },
        origin: DESTINATION_ORIGIN,
      })
    ).rejects.toBeInstanceOf(CallableError);

    await expect(
      getDocFromServer(doc(destination.db, "users", sourceSeed.uid))
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      getDocsFromServer(collection(destination.db, "users", sourceSeed.uid, "sessions"))
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(
      (await getDocFromServer(doc(linkedLogin.db, "users", sourceSeed.uid))).data()?.isAnonymous
    ).toBe(false);
    expect(
      (await getDocsFromServer(collection(linkedLogin.db, "users", sourceSeed.uid, "sessions"))).size
    ).toBe(3);

    const linkedProfileRef = doc(linkedLogin.db, "users", sourceSeed.uid);
    await expect(
      setDoc(linkedProfileRef, { isAnonymous: true }, { merge: true })
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      setDoc(linkedProfileRef, { targetVolume: "150" })
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(deleteDoc(linkedProfileRef)).rejects.toMatchObject({
      code: "permission-denied",
    });

    await setDoc(
      doc(linkedLogin.db, "users", sourceSeed.uid, "sessions", "linked-session-write"),
      {
        volume: 64,
        duration: 16,
        startedAt: "2026-10-02T03:15:00.000Z",
        createdAt: Timestamp.fromDate(new Date("2026-10-02T03:31:00.000Z")),
      }
    );
    expect(
      (await getDocsFromServer(collection(linkedLogin.db, "users", sourceSeed.uid, "sessions"))).size
    ).toBe(4);
  });
});
