import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, DocumentData } from "firebase-admin/firestore";
import OpenAI from "openai";


const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// ─── Constants ────────────────────────────────────────────────────────────────
const MODEL = "gpt-4o-mini";
const MAX_TOKENS_SUMMARY = 600;
const MAX_TOKENS_FOLLOWUP = 300;
const MAX_FOLLOWUPS_PER_DAY = 3;
const COOLDOWN_MS = 5 * 60 * 1000;      // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

/** Pre-anonymized session shape received from the client hook */
interface AnonymizedSession {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  duration: number; // minutes
  volume: number; // ml
}

/** Request payload for generateSummary */
interface GenerateSummaryRequest {
  userId: string;
  sessions: AnonymizedSession[];
  babyAge: string | null;
  feedingMethod: string | null;
  pumpingGoals: string | null;
}

/** Response payload for generateSummary */
interface GenerateSummaryResponse {
  summary: string;
  suggestions: string[];
  questions: string[];
}

/** Request payload for answerFollowUp */
interface AnswerFollowUpRequest {
  userId: string;
  question: string;
  summaryContext: string;
}

/** Response payload for answerFollowUp */
interface AnswerFollowUpResponse {
  answer: string;
}

/** Shape of the AI summary document stored in Firestore */
interface SummaryCache extends DocumentData {
  summary: string;
  suggestions: string[];
  questions: string[];
  generatedAt: number;
  lastManualRefreshAt: number;
  followUpsUsedToday: number;
  followUpsResetAt: string; // "YYYY-MM-DD"
}

/** Parsed AI output from OpenAI JSON response */
interface AISummaryOutput {
  summary: string;
  suggestions: string[];
  questions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's date string in YYYY-MM-DD (Jakarta time, UTC+7). */
function todayKey(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Validate and sanitize incoming session data.
 * The hook already strips PII — this is a defensive server-side check.
 * Expects pre-anonymized shape: { date, time, duration, volume }
 */
function sanitizeSessions(sessions: unknown): AnonymizedSession[] {
  if (!Array.isArray(sessions)) return [];

  return sessions
    .slice(0, 50) // hard cap — no unbounded arrays
    .filter((s) => !!s?.date && !!s?.time)
    .map((s) => ({
      date: String(s.date).slice(0, 10),  // "YYYY-MM-DD"
      time: String(s.time).slice(0, 5),   // "HH:MM"
      duration: Number(s.duration ?? 0),      // minutes
      volume: Number(s.volume ?? 0),      // ml
    }));
}

/** Format session array into a readable string block for the prompt. */
function formatSessionsForPrompt(sessions: AnonymizedSession[]): string {
  if (sessions.length === 0) return "No sessions recorded.";

  return sessions
    .map((s) => `- ${s.date} ${s.time} | ${s.duration} min | ${s.volume} ml`)
    .join("\n");
}

/** Build the system prompt for summary generation. */
function buildSummarySystemPrompt(): string {
  return `
You are a warm, encouraging lactation assistant helping a mother track her breast milk pumping journey.

Rules you must always follow:
- You are NOT a medical professional. Never diagnose or prescribe.
- Never use alarming or clinical language, especially around milk supply.
- Never assume the user's feeding goals unless explicitly provided.
- Frame all insights as gentle observations, not judgments.
- Use supportive, conversational Indonesian-friendly English (clear, simple, warm).
- If data is sparse, still be encouraging — acknowledge the effort.
- If user provides baby birth date and the pumping method is 'exclusive' and not 'supplemental', calculate whether the user is on track to meet the WHO recommendation according to the baby's age. if not, give a gentle suggestion on how to improve.
- The 'questions' array MUST contain 3 sample questions the user could ask YOU to dig deeper into their data or get specific advice. They must be written from the user's perspective (e.g. "Why is my volume lower in the evening?", "Is 500ml a day normal?", "How can I increase my supply?").

Output format (respond ONLY in this exact JSON structure, no markdown, no preamble):
{
  "summary": "2-3 warm sentences summarizing the week. Mention total volume, frequency, and one positive observation.",
  "suggestions": [
    "First practical tip based on the data",
    "Second practical tip based on the data"
  ],
  "questions": [
    "Sample question the user might want to ask YOU",
    "Another sample question the user could ask",
    "A third question the user might have about their data"
  ]
}
`.trim();
}

/** Build the user message for summary generation. */
function buildSummaryUserMessage({
  sessions,
  babyAge,
  feedingMethod,
  pumpingGoals,
}: Pick<GenerateSummaryRequest, "sessions" | "babyAge" | "feedingMethod" | "pumpingGoals"> & {
  sessions: AnonymizedSession[];
}): string {
  const contextLines: string[] = [];
  if (babyAge) contextLines.push(`- Baby's age: ${babyAge}`);
  if (feedingMethod) contextLines.push(`- Feeding method: ${feedingMethod}`);
  if (pumpingGoals) contextLines.push(`- Pumping goals: ${pumpingGoals}`);

  const contextBlock = contextLines.length > 0
    ? `User context:\n${contextLines.join("\n")}\n\n`
    : "";

  const sessionBlock = formatSessionsForPrompt(sessions);

  return `${contextBlock}Pumping sessions from the last 7 days:\n${sessionBlock}\n\nPlease generate the summary.`;
}

/** Build the system prompt for follow-up answers. */
function buildFollowUpSystemPrompt(): string {
  return `
You are a warm, encouraging lactation assistant.

You have already provided a weekly summary to the user.
Answer their follow-up question based on that summary context.

Rules:
- You are NOT a medical professional. Never diagnose or prescribe.
- Keep answers concise — 2-4 sentences maximum.
- Stay warm, practical, and encouraging.
- If the question is outside your scope, gently say so and suggest consulting a lactation consultant.
- Do not repeat the full summary back — just answer the question directly.
`.trim();
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

function summaryDocRef(userId: string) {
  const db = getFirestore();
  return db.collection("ai_summaries").doc(userId);
}

async function readFirestoreCache(userId: string): Promise<SummaryCache | null> {
  const snap = await summaryDocRef(userId).get();
  if (!snap.exists) return null;

  const data = snap.data() as SummaryCache;
  const generatedDate = new Date(data.generatedAt).toDateString();
  const todayDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toDateString();
  if (generatedDate !== todayDate) return null;

  return data;
}

async function writeFirestoreCache(userId: string, payload: Partial<SummaryCache>): Promise<void> {
  await summaryDocRef(userId).set(payload, { merge: true });
}

// ─── Function 1: generateSummary ──────────────────────────────────────────────

export const generateAiSummary = onCall<GenerateSummaryRequest, Promise<GenerateSummaryResponse>>(
  {
    region: "asia-southeast1",
    secrets: [OPENAI_API_KEY],
    invoker: "public",
    cors: true,
  },
  async (request: CallableRequest<GenerateSummaryRequest>): Promise<GenerateSummaryResponse> => {
    // ── Auth guard ────────────────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const callerUid = request.auth.uid;
    const { userId, sessions, babyAge, feedingMethod, pumpingGoals } = request.data;

    // Ensure caller can only generate their own summary
    if (callerUid !== userId) {
      throw new HttpsError("permission-denied", "You can only access your own data.");
    }

    // ── Input validation ──────────────────────────────────────────────────────
    const sanitized = sanitizeSessions(sessions);
    if (sanitized.length === 0) {
      throw new HttpsError("invalid-argument", "No valid session data provided.");
    }

    // ── Cooldown check (server-side) ──────────────────────────────────────────
    const cached = await readFirestoreCache(userId);
    if (cached?.lastManualRefreshAt) {
      const elapsed = Date.now() - cached.lastManualRefreshAt;
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        throw new HttpsError(
          "resource-exhausted",
          `Please wait ${remaining} more minute(s) before refreshing.`
        );
      }
    }

    // ── Call OpenAI ───────────────────────────────────────────────────────────
    // Instantiate inside the handler so the secret is resolved at runtime
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });

    let parsed: AISummaryOutput;
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS_SUMMARY,
        temperature: 0.7,
        messages: [
          { role: "system", content: buildSummarySystemPrompt() },
          {
            role: "user",
            content: buildSummaryUserMessage({
              sessions,
              babyAge: babyAge ?? null,
              feedingMethod: feedingMethod ?? null,
              pumpingGoals: pumpingGoals ?? null,
            }),
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "";
      parsed = JSON.parse(raw) as AISummaryOutput;

    } catch (err) {
      console.error("OpenAI error:", err);
      throw new HttpsError("internal", "Failed to generate summary. Please try again.");
    }

    // ── Validate parsed structure ─────────────────────────────────────────────
    if (
      !parsed?.summary ||
      !Array.isArray(parsed?.suggestions) ||
      !Array.isArray(parsed?.questions)
    ) {
      throw new HttpsError("internal", "Unexpected response format from AI.");
    }

    // ── Persist to Firestore ──────────────────────────────────────────────────
    const now = Date.now();
    const cachePayload: SummaryCache = {
      summary: parsed.summary,
      suggestions: parsed.suggestions.slice(0, 2),
      questions: parsed.questions.slice(0, 3),
      generatedAt: now,
      lastManualRefreshAt: now,
      followUpsUsedToday: cached?.followUpsResetAt === todayKey()
        ? (cached?.followUpsUsedToday ?? 0)
        : 0,
      followUpsResetAt: todayKey(),
    };

    await writeFirestoreCache(userId, cachePayload);

    return {
      summary: cachePayload.summary,
      suggestions: cachePayload.suggestions,
      questions: cachePayload.questions,
    };
  }
);

// ─── Function 2: answerFollowUp ───────────────────────────────────────────────

export const answerAiFollowUp = onCall<AnswerFollowUpRequest, Promise<AnswerFollowUpResponse>>(
  {
    region: "asia-southeast1",
    secrets: [OPENAI_API_KEY],
    invoker: "public",
    cors: true,
    enforceAppCheck: true,
  },
  async (request: CallableRequest<AnswerFollowUpRequest>): Promise<AnswerFollowUpResponse> => {
    // ── Auth guard ────────────────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const callerUid = request.auth.uid;
    const { userId, question, summaryContext } = request.data;

    if (callerUid !== userId) {
      throw new HttpsError("permission-denied", "You can only access your own data.");
    }

    // ── Input validation ──────────────────────────────────────────────────────
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      throw new HttpsError("invalid-argument", "A valid question is required.");
    }

    if (!summaryContext || typeof summaryContext !== "string") {
      throw new HttpsError("invalid-argument", "Summary context is required.");
    }

    // ── Rate limit check (server-side, source of truth) ───────────────────────
    const cached = await readFirestoreCache(userId);
    const today = todayKey();
    const usedToday = cached?.followUpsResetAt === today
      ? (cached?.followUpsUsedToday ?? 0)
      : 0;

    if (usedToday >= MAX_FOLLOWUPS_PER_DAY) {
      throw new HttpsError(
        "resource-exhausted",
        `You've reached the daily limit of ${MAX_FOLLOWUPS_PER_DAY} follow-up questions. Come back tomorrow!`
      );
    }

    // ── Call OpenAI ───────────────────────────────────────────────────────────
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY.value() });

    let answer: string;
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: MAX_TOKENS_FOLLOWUP,
        temperature: 0.7,
        messages: [
          { role: "system", content: buildFollowUpSystemPrompt() },
          { role: "assistant", content: summaryContext }, // inject existing summary as prior context
          { role: "user", content: question.trim() },
        ],
      });

      answer = response.choices[0]?.message?.content?.trim() ?? "";

    } catch (err) {
      console.error("OpenAI error:", err);
      throw new HttpsError("internal", "Failed to answer question. Please try again.");
    }

    if (!answer) {
      throw new HttpsError("internal", "Empty response from AI.");
    }

    // ── Update rate limit counter in Firestore ────────────────────────────────
    const newUsed = usedToday + 1;
    await summaryDocRef(userId).set(
      {
        followUpsUsedToday: newUsed,
        followUpsResetAt: today,
      },
      { merge: true }
    );

    return { answer };
  }
);
