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
  deleteDoc
} from "firebase/firestore";

// Helper to get collection reference
const getUserSessionsCollection = (userId: string) => collection(db, 'users', userId, 'sessions');
const getUserDocument = (userId: string) => doc(db, 'users', userId);

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
