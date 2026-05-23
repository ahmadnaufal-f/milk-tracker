import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { User } from 'firebase/auth';
import { subscribeToRecentSessions, subscribeToSettings, PumpingSession, AISummarizationContext } from '@/services/storage';
import { useSummarizer } from '@/hooks/useAISummarizer';
import BasePage from '@/components/BasePage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AiLoader from '@/components/ui/ai-loading';
import { Sparkles } from 'lucide-react';

export default function AISummaryPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<PumpingSession[]>([]);
  const [aiContext, setAiContext] = useState<AISummarizationContext | null>(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(setUser);
    return unsub;
  }, []);

  // ── Data Fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    // Fetch last 2 weeks and 1 day of sessions
    const unsubSessions = subscribeToRecentSessions(user.uid, 15, setSessions);

    // Fetch AI Context settings
    const unsubSettings = subscribeToSettings(user.uid, (settings) => {
      setAiContext(settings.aiContext || null);
    });

    return () => {
      unsubSessions();
      unsubSettings();
    };
  }, [user]);

  // ── AI Hook ─────────────────────────────────────────────────────────────────
  const {
    summary,
    suggestions,
    questions,
    followUpAnswer,
    lastUpdatedAt,
    loading,
    followUpLoading,
    error,
    hasSummary,
    followUpsRemaining,
    refresh,
    answerFollowUp,
  } = useSummarizer({
    userId: user?.uid ?? null,
    sessions,
    aiContext,
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleQuestionClick = (q: string) => {
    answerFollowUp(q);
  };

  const formatSummary = (text: string) => {
    return text.split('\n').map((paragraph, index) => (
      <p key={index} className="mb-2 last:mb-0 leading-relaxed text-sm" style={{ color: 'var(--color-body)' }}>
        {paragraph}
      </p>
    ));
  };

  // ── Render Helpers ──────────────────────────────────────────────────────────
  return (
    <BasePage showBackButton onBack={() => navigate(-1)} pageTitle="">
      <div className="w-full max-w-lg space-y-6 mx-auto">
        {/* Header / Error */}
        <div className="flex items-center justify-between px-4">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-linear-to-r from-purple-500 to-indigo-500">
              Weekly Insights
            </h1>
            {lastUpdatedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {new Date(lastUpdatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50/50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Empty / Loading / Summary State */}
        {!hasSummary ? (
          <div className="flex flex-col items-center justify-center h-[50vh] space-y-6">
            {loading ? (
              <div className="flex flex-col items-center gap-4">
                <AiLoader />
                <p className="text-sm font-medium animate-pulse text-purple-600">Analyzing your sessions...</p>
              </div>
            ) : (
              <div className="text-center px-4 space-y-4">
                <div className="w-20 h-20 mx-auto bg-purple-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-purple-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--color-heading)' }}>Ready for Insights?</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Generate your first AI summary to discover patterns, trends, and personalised suggestions based on your last 7 days of pumping.
                  </p>
                </div>
                <Button
                  onClick={refresh}
                  className="bg-purple-600 hover:bg-purple-700 text-white w-full rounded-xl py-6 text-md font-semibold mt-4 shadow-lg shadow-purple-500/20 transition-all hover:scale-[1.02]"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate My Summary
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main Summary */}
            <Card className="border-purple-200/50 bg-white/60 backdrop-blur-md shadow-xl shadow-purple-900/5 overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-purple-400 to-indigo-400" />
              <CardContent className="pt-2 relative">
                {loading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <AiLoader />
                  </div>
                )}
                <div className="prose prose-sm prose-purple max-w-none">
                  {summary ? formatSummary(summary) : null}
                </div>
              </CardContent>
            </Card>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2 px-4">
                  Suggestions
                </h3>
                <div className="grid gap-2">
                  {suggestions.map((suggestion, i) => (
                    <div key={i} className="bg-purple-50/50 border border-purple-100 p-3 rounded-xl flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                      <p className="text-sm text-purple-900/80 leading-relaxed m-0">{suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow up Questions */}
            {((questions.length > 0 && followUpsRemaining > 0) || (followUpAnswer || followUpLoading)) && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2 px-4">
                  Ask a Follow-up
                  <span className="ml-auto text-xs font-normal text-muted-foreground bg-purple-100 px-2 py-0.5 rounded-full">
                    {followUpsRemaining} remaining today
                  </span>
                </h3>

                {/* Follow-up Answer Display */}
                {followUpAnswer && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 shadow-inner relative mt-4">
                    <div className="absolute -top-2.5 left-4 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      AI Reply
                    </div>
                    <p className="text-sm text-indigo-900 leading-relaxed mt-2 m-0 whitespace-pre-wrap">
                      {followUpAnswer}
                    </p>
                  </div>
                )}

                {/* Suggested Questions */}
                {followUpLoading && (
                  <div className="flex w-full items-center justify-center p-4">
                    <AiLoader />
                  </div>
                )}

                {questions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {questions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuestionClick(q)}
                        disabled={followUpLoading || followUpsRemaining <= 0}
                        className="text-xs bg-grey-50 border-purple-300 text-purple-700 border px-3 py-1.5 rounded-full transition-colors text-left"
                      >
                        "{q}"
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </BasePage>
  );
}
