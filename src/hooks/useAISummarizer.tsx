import { useState, useEffect, useCallback } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/firebase";
import { AISummarizationContext, PumpingGoal, PumpingSession } from "@/services/storage";

// ─── Constants ────────────────────────────────────────────────────────────────
const CACHE_KEY = "milktrack_summary_cache";
const COOLDOWN_MS = 5 * 60 * 1000;       // 5 minutes
const MAX_FOLLOWUPS_PER_DAY = 3;
const MAX_ASKED_QUESTIONS = 15;           // cap to avoid bloating the prompt

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw pump session shape as stored in Firestore */
export interface PumpSession {
  id: string;
  volume: number; // ml
  duration: number; // minutes
  startedAt: string; // ISO 8601 e.g. "2026-05-17T02:49:00.000Z"
  createdAt: {
    type: string;
    seconds: number;
    nanoseconds: number;
  };
}

/** Anonymized session shape sent to the Firebase Function */
interface AnonymizedSession {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  duration: number; // minutes
  volume: number; // ml
}

/**
 * Payload sent to generateSummary Firebase Function.
 * babyAge, feedingMethod, pumpingGoals are human-readable strings
 * derived from AISummarizationContext — ready to inject into the prompt.
 */
interface SummaryRequestPayload {
  userId: string;
  currentWeekSessions: AnonymizedSession[];
  previousWeekSessions: AnonymizedSession[] | null;
  babyAge: string | null; // e.g. "3 months old", "1 year 2 months old"
  feedingMethod: string | null; // e.g. "exclusive pumping", "supplemental pumping"
  pumpingGoals: string | null; // e.g. "building a freezer stash, returning to work"
  askedQuestions: string[];
}

/** Response from generateSummary Firebase Function */
interface SummaryResponse {
  summary: string;
  suggestions: string[];
  questions: string[];
}

/** Payload sent to answerFollowUp Firebase Function */
interface FollowUpRequestPayload {
  userId: string;
  question: string;
  summaryContext: string;
}

/** Response from answerFollowUp Firebase Function */
interface FollowUpResponse {
  answer: string;
}

/** Shape of the data persisted in localStorage */
interface SummaryCache {
  summary: string;
  suggestions: string[];
  questions: string[];
  generatedAt: number;        // Unix ms
  lastManualRefreshAt: number | null; // Unix ms
  followUpsUsedToday: number;
  followUpsResetAt: string;        // "YYYY-MM-DD"
  askedQuestions: string[];
}

/** Hook input params */
export interface UseSummarizerParams {
  userId: string | null;
  sessions?: PumpingSession[];
  aiContext?: AISummarizationContext | null;
}

/** Hook return value */
export interface UseSummarizerReturn {
  // Data
  summary: string | null;
  suggestions: string[];
  questions: string[];
  followUpAnswer: string | null;
  lastUpdatedAt: number | null;

  // Status
  loading: boolean;
  followUpLoading: boolean;
  error: string | null;
  hasSummary: boolean;
  canManualRefresh: boolean;
  followUpsUsed: number;
  followUpsRemaining: number;

  // Actions
  refresh: () => void;
  answerFollowUp: (question: string) => Promise<void>;
  clearSummary: () => void;
}

// ─── Context derivation helpers ───────────────────────────────────────────────

/**
 * Derives a human-readable baby age string from a YYYY-MM-DD birthdate.
 * e.g. "2026-02-17" → "3 months old"
 *      "2025-03-01" → "1 year 2 months old"
 * Returns null if birthdate is not provided.
 */
function deriveBabyAge(birthdate: string | undefined): string | null {
  if (!birthdate) return null;

  const birth = new Date(birthdate);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());

  if (months < 1) return "less than 1 month old";
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} old`;

  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const yearPart = `${years} year${years !== 1 ? "s" : ""}`;
  const monthPart = remainder > 0 ? ` ${remainder} month${remainder !== 1 ? "s" : ""}` : "";
  return `${yearPart}${monthPart} old`;
}

/**
 * Derives a human-readable feeding method string.
 * Returns null if feedingMethod is not provided.
 */
function deriveFeedingMethod(
  feedingMethod: AISummarizationContext["feedingMethod"]
): string | null {
  if (!feedingMethod) return null;
  return feedingMethod === "exclusive"
    ? "exclusive pumping (no direct breastfeeding)"
    : "supplemental pumping (combination of breastfeeding and pumping)";
}

/**
 * Derives a comma-separated string of active pumping goal labels.
 * e.g. { freezerStash: true, returningToWork: true, ... } → "building a freezer stash, returning to work"
 * Returns null if no goals are provided or none are active.
 */
function derivePumpingGoals(pumpingGoal: PumpingGoal | undefined): string | null {
  if (!pumpingGoal) return null;

  const labelMap: Record<keyof PumpingGoal, string> = {
    freezerStash: "building a freezer stash",
    maintainingSupply: "maintaining current supply",
    increasingSupply: "increasing supply",
    returningToWork: "returning to work",
    weaning: "weaning",
  };

  const active = (Object.keys(labelMap) as Array<keyof PumpingGoal>)
    .filter((key) => pumpingGoal[key])
    .map((key) => labelMap[key]);

  return active.length > 0 ? active.join(", ") : null;
}

// ─── Session split helper ─────────────────────────────────────────────────────

/**
 * Anonymizes a single raw PumpSession into an AnonymizedSession.
 * Strips id and createdAt; derives date and time from startedAt.
 */
function anonymizeSession(s: PumpingSession): AnonymizedSession {
  const started = new Date(s.startedAt);
  return {
    date: started.toISOString().slice(0, 10),  // "2026-05-17"
    time: started.toISOString().slice(11, 16), // "02:49"
    duration: Number(s.duration ?? 0),
    volume: Number(s.volume ?? 0),
    // id, createdAt intentionally omitted
  };
}

/**
 * Splits the full session history into current and previous week buckets.
 *
 * - currentWeekSessions  → sessions from the last 7 days (days 0–6)
 * - previousWeekSessions → sessions from days 7–13, or null if unavailable
 *
 * "Day 0" is today (UTC). All comparisons are based on startedAt timestamps.
 */
function splitSessionsByWeek(sessions: PumpingSession[]): {
  currentWeekSessions: AnonymizedSession[];
  previousWeekSessions: AnonymizedSession[] | null;
} {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff7 = now - 7 * DAY_MS;
  const cutoff14 = now - 14 * DAY_MS;

  const currentWeekSessions: AnonymizedSession[] = [];
  const previousWeekSessions: AnonymizedSession[] = [];

  for (const s of sessions) {
    const ts = new Date(s.startedAt).getTime();
    if (ts >= cutoff7) {
      currentWeekSessions.push(anonymizeSession(s));
    } else if (ts >= cutoff14) {
      previousWeekSessions.push(anonymizeSession(s));
    }
  }

  const distinctPreviousDates = new Set(previousWeekSessions.map((s) => s.date)).size;

  return {
    currentWeekSessions,
    previousWeekSessions: distinctPreviousDates > 0 ? previousWeekSessions : null,
  };
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

/** Read the cached summary from localStorage. Returns null if missing or expired. */
function readLocalCache(): SummaryCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SummaryCache;
    const generatedDate = new Date(parsed.generatedAt).toDateString();
    const todayDate = new Date().toDateString();
    if (generatedDate !== todayDate) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** Write a fresh summary result into localStorage. */
function writeLocalCache(data: SummaryCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable in some environments — fail silently
  }
}

/** Clear the local cache entirely. */
function clearLocalCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // fail silently
  }
}

/** Returns today's date string (YYYY-MM-DD) for rate limit bucketing. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useSummarizer
 *
 * Manages the AI summary lifecycle:
 *   - Auto-fetches on mount if cache is stale
 *   - Exposes manual refresh (with cooldown enforcement)
 *   - Exposes follow-up question answering (with daily rate limit)
 *   - Uses localStorage as fast read layer, Firestore as source of truth
 *   - Tracks asked questions to prevent the AI from suggesting repeats
 *   - Splits sessions into current/previous week for two-week comparison
 */
export function useSummarizer({
  userId,
  sessions = [],
  aiContext = null,
}: UseSummarizerParams): UseSummarizerReturn {
  const functions = getFunctions(app, "asia-southeast1");
  const generateSummaryFn = httpsCallable<SummaryRequestPayload, SummaryResponse>(
    functions, "generateAiSummary"
  );
  const answerFollowUpFn = httpsCallable<FollowUpRequestPayload, FollowUpResponse>(
    functions, "answerAiFollowUp"
  );

  const aiEnabled = aiContext?.enabled ?? false;

  // ── State ──────────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
  const [followUpsUsed, setFollowUpsUsed] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [followUpLoading, setFollowUpLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [canManualRefresh, setCanManualRefresh] = useState<boolean>(true);

  // ── Hydrate from localStorage on mount ────────────────────────────────────
  useEffect(() => {
    if (!aiEnabled) return;

    const cache = readLocalCache();
    if (cache) applyCache(cache);
    setLoading(false);
  }, [aiEnabled]);

  // ── Auto-fetch if cache is stale ──────────────────────────────────────────
  useEffect(() => {
    if (!aiEnabled || !userId || sessions.length === 0) return;

    const cache = readLocalCache();
    if (!cache) fetchSummary({ isManual: false });
  }, [aiEnabled, userId, sessions.length]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function applyCache(cache: SummaryCache): void {
    setSummary(cache.summary);
    setSuggestions(cache.suggestions ?? []);
    setQuestions(cache.questions ?? []);
    setLastUpdatedAt(cache.generatedAt);

    // Restore follow-up counter for today
    const today = todayKey();
    setFollowUpsUsed(
      cache.followUpsResetAt === today ? (cache.followUpsUsedToday ?? 0) : 0
    );

    // Restore cooldown state
    if (cache.lastManualRefreshAt != null) {
      const elapsed = Date.now() - cache.lastManualRefreshAt;
      setCanManualRefresh(elapsed >= COOLDOWN_MS);
    }
  }

  /**
   * Builds the payload for generateSummary.
   * - Splits sessions into current/previous week buckets
   * - Passes the last N asked questions to prevent repeats
   * - Derives human-readable context strings from AISummarizationContext
   */
  function buildPayload(): Omit<SummaryRequestPayload, "userId"> {
    const { currentWeekSessions, previousWeekSessions } = splitSessionsByWeek(sessions);

    // Pull asked questions from cache; cap to MAX_ASKED_QUESTIONS to keep prompt lean
    const existingCache = readLocalCache();
    const askedQuestions = (existingCache?.askedQuestions ?? []).slice(-MAX_ASKED_QUESTIONS);

    return {
      currentWeekSessions,
      previousWeekSessions,
      babyAge: deriveBabyAge(aiContext?.babyBirthdate),
      feedingMethod: deriveFeedingMethod(aiContext?.feedingMethod),
      pumpingGoals: derivePumpingGoals(aiContext?.pumpingGoal),
      askedQuestions,
    };
  }

  // ── fetchSummary ──────────────────────────────────────────────────────────

  const fetchSummary = useCallback(
    async ({ isManual = false }: { isManual?: boolean } = {}): Promise<void> => {
      if (!userId) return;

      // Enforce cooldown for manual refreshes
      if (isManual) {
        const cache = readLocalCache();
        if (cache?.lastManualRefreshAt != null) {
          const elapsed = Date.now() - cache.lastManualRefreshAt;
          if (elapsed < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
            setError(`Please wait ${remaining} more minute(s) before refreshing.`);
            return;
          }
        }
      }

      setLoading(true);
      setError(null);

      try {
        const payload = buildPayload();
        const result = await generateSummaryFn({ userId, ...payload });
        const data = result.data;

        const now = Date.now();
        const existing = readLocalCache();

        const newCache: SummaryCache = {
          summary: data.summary,
          suggestions: data.suggestions,
          questions: data.questions,
          generatedAt: now,
          lastManualRefreshAt: isManual ? now : (existing?.lastManualRefreshAt ?? null),
          followUpsUsedToday: existing?.followUpsResetAt === todayKey()
            ? (existing?.followUpsUsedToday ?? 0)
            : 0,
          followUpsResetAt: todayKey(),
          // Carry over existing asked questions — they accumulate across summaries
          askedQuestions: existing?.askedQuestions ?? [],
        };

        writeLocalCache(newCache);
        applyCache(newCache);
        if (isManual) setCanManualRefresh(false);

      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : "Failed to generate summary. Please try again.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [userId, sessions, aiContext]
  );

  // ── answerFollowUp ────────────────────────────────────────────────────────

  const answerFollowUp = useCallback(
    async (question: string): Promise<void> => {
      if (!userId || !summary) return;

      // Client-side rate limit check (server also enforces this)
      const cache = readLocalCache();
      const today = todayKey();
      const usedToday = cache?.followUpsResetAt === today
        ? (cache?.followUpsUsedToday ?? 0)
        : 0;

      if (usedToday >= MAX_FOLLOWUPS_PER_DAY) {
        setError(
          `You've reached the daily limit of ${MAX_FOLLOWUPS_PER_DAY} follow-up questions. Come back tomorrow!`
        );
        return;
      }

      setFollowUpLoading(true);
      setFollowUpAnswer(null);
      setError(null);

      try {
        const result = await answerFollowUpFn({ userId, question, summaryContext: summary });
        const answer = result.data.answer;
        const newUsed = usedToday + 1;

        const cached = readLocalCache();

        // Track this question so the AI won't suggest it again in the future
        const existingAsked = cached?.askedQuestions ?? [];
        const updatedAsked = [...existingAsked, question].slice(-MAX_ASKED_QUESTIONS);

        // Remove the tapped question from the suggested list
        const updatedQuestions = (cached?.questions ?? []).filter(q => q !== question);

        // Update local cache: counters, asked questions, and filtered question list
        const updatedCache: SummaryCache = {
          ...(cached ?? {} as SummaryCache),
          questions: updatedQuestions,
          followUpsUsedToday: newUsed,
          followUpsResetAt: today,
          askedQuestions: updatedAsked,
        };
        writeLocalCache(updatedCache);

        setFollowUpAnswer(answer);
        setFollowUpsUsed(newUsed);
        setQuestions(qs => qs.filter(q => q !== question));

      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : "Failed to answer question. Please try again.";
        setError(message);
      } finally {
        setFollowUpLoading(false);
      }
    },
    [userId, summary]
  );

  // ── clearSummary ──────────────────────────────────────────────────────────

  const clearSummary = useCallback((): void => {
    clearLocalCache();
    setSummary(null);
    setSuggestions([]);
    setQuestions([]);
    setFollowUpAnswer(null);
    setFollowUpsUsed(0);
    setLastUpdatedAt(null);
    setCanManualRefresh(true);
    setError(null);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const followUpsRemaining = MAX_FOLLOWUPS_PER_DAY - followUpsUsed;
  const hasSummary = summary !== null;

  return {
    // Data
    summary,
    suggestions,
    questions,
    followUpAnswer,
    lastUpdatedAt,

    // Status
    loading,
    followUpLoading,
    error,
    hasSummary,
    canManualRefresh,
    followUpsUsed,
    followUpsRemaining,

    // Actions
    refresh: () => fetchSummary({ isManual: true }),
    answerFollowUp,
    clearSummary,
  };
}
