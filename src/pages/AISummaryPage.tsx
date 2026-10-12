import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToRecentSessions, subscribeToSettings, PumpingSession, AISummarizationContext } from '@/services/storage';
import { useSummarizer } from '@/hooks/useAISummarizer';
import { useAuth } from '@/contexts/AuthContext';
import BasePage from '@/components/BasePage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AiLoader from '@/components/ui/ai-loading';
import { Sparkles, Lock } from 'lucide-react';

export default function AISummaryPage() {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const [sessions, setSessions] = useState<PumpingSession[]>([]);
  const [aiContext, setAiContext] = useState<AISummarizationContext | null>(null);

  // ── Data Fetching ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || isAnonymous) {
      setSessions([]);
      setAiContext(null);
      return;
    }

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
  }, [user, isAnonymous]);

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
    userId: isAnonymous ? null : user?.uid ?? null,
    sessions,
    aiContext,
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleQuestionClick = (q: string) => {
    answerFollowUp(q);
  };

  const renderInlineMarkdown = (text: string) => {
    // Split on **bold** or *italic* tokens
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const formatSummary = (text: string) => {
    const paragraphs = text.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);

    return paragraphs.map((paragraph, index) => (
      <p key={index} className="text-base leading-7 sm:text-[1.0625rem] sm:leading-8" style={{ color: 'var(--color-body)' }}>
        {renderInlineMarkdown(paragraph)}
      </p>
    ));
  };

  // ── Guest Gate ──────────────────────────────────────────────────────────────
  if (isAnonymous) {
    return (
      <BasePage showBackButton onBack={() => navigate(-1)} pageTitle="">
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4 px-8">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center">
            <Lock className="w-10 h-10 text-purple-400" />
          </div>
          <h2 className="text-xl font-bold">AI Insights Locked</h2>
          <p className="text-sm text-muted-foreground">
            Link your Google account to unlock AI-powered insights after 7 days of tracking.
          </p>
          <Button onClick={() => navigate('/tracker')} variant="outline">
            Back to Tracker
          </Button>
        </div>
      </BasePage>
    );
  }

  // ── Render Helpers ──────────────────────────────────────────────────────────
  return (
    <BasePage showBackButton onBack={() => navigate(-1)} pageTitle="">
      <div className="w-full max-w-lg space-y-6 mx-auto">
        {/* Header / Error */}
        <div className="flex items-center justify-between px-4">
          <div>
            <h1 className="text-2xl font-semibold text-purple-900">
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
                <p className="text-sm font-medium text-purple-700">Analyzing your sessions...</p>
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
                  className="bg-purple-700 hover:bg-purple-800 text-white w-full rounded-xl py-6 text-base font-semibold mt-4 shadow-sm transition-colors"
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
            <Card aria-busy={loading} className="gap-0 border-purple-200 bg-white shadow-sm overflow-hidden relative">
              <CardContent className="p-5 sm:p-6">
                {loading && (
                  <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-xl">
                    <AiLoader />
                  </div>
                )}
                <div className="mb-4 flex items-center gap-2 text-purple-800">
                  <Sparkles aria-hidden="true" className="size-4" />
                  <h2 className="text-base font-semibold" id="summary-key-takeaway">Key takeaway</h2>
                </div>
                <section aria-labelledby="summary-key-takeaway" className="space-y-4">
                  {summary ? formatSummary(summary) : null}
                </section>
              </CardContent>
            </Card>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-purple-900 flex items-center gap-2 px-4">
                  Suggestions
                </h3>
                <div className="grid gap-2">
                  {suggestions.map((suggestion, i) => (
                    <div key={i} className="bg-purple-50/50 border border-purple-100 p-3 rounded-xl flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                      <p className="text-base text-purple-900 leading-7 m-0">{suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow up Questions */}
            {((questions.length > 0 && followUpsRemaining > 0) || (followUpAnswer || followUpLoading)) && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-purple-900 flex items-center gap-2 px-4">
                  Ask a Follow-up
                  <span className="ml-auto text-xs font-normal text-muted-foreground bg-purple-100 px-2 py-0.5 rounded-full">
                    {followUpsRemaining} remaining today
                  </span>
                </h3>

                {/* Follow-up Answer Display */}
                {followUpAnswer && (
                  <section aria-labelledby="ai-reply-heading" className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
                    <h4 id="ai-reply-heading" className="mb-4 text-base font-semibold text-purple-900">AI Reply</h4>
                    <div className="space-y-4">{formatSummary(followUpAnswer)}</div>
                  </section>
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
                        className="min-h-11 rounded-xl border border-purple-300 bg-purple-50 px-3 py-2 text-left text-sm text-purple-800 transition-colors hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
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
