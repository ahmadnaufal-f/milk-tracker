import React, { useState, useEffect } from 'react';
import { PumpingSession, subscribeToSessions, subscribeToSettings } from '@/services/storage';
import usePumpingControl from '@/hooks/usePumpingControl';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from './ui/spinner';
import useSummarizeableCheck from '@/hooks/useSummarizeableCheck';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';

const PumpingInformation: React.FC = () => {
  const {
    isPumping,
    setVolume,
    setTargetDuration
  } = usePumpingControl();

  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);
  const [sessions, setSessions] = useState<PumpingSession[]>([]);
  const [isAISummarizationEnabled, setIsAISummarizationEnabled] = useState(false);
  const { isSummarizeable } = useSummarizeableCheck(sessions);

  useEffect(() => {
    if (user) {
      let settingsLoaded = false;
      let sessionsLoaded = false;

      const checkLoaded = () => {
        if (settingsLoaded && sessionsLoaded) {
          setIsInitialLoading(false);
        }
      };

      const unsubscribe = subscribeToSettings(user.uid, (settings) => {
        if (settings.targetVolume) {
          setVolume(settings.targetVolume);
        }
        if (settings.targetDuration) {
          setTargetDuration(settings.targetDuration);
        }
        setIsAISummarizationEnabled(settings.aiContext?.enabled ?? false);
        settingsLoaded = true;
        checkLoaded();
      });
      const unsubscribeTodayTotal = subscribeToSessions(user.uid, (sessions) => {
        setSessions(sessions);
        const todaySessions = sessions.filter((session) => {
          const sessionDate = new Date(session.startedAt);
          return sessionDate.toDateString() === new Date().toDateString();
        });
        const totalVolume = todaySessions.reduce((total, session) => total + session.volume, 0);
        setTodayTotal(totalVolume);
        sessionsLoaded = true;
        checkLoaded();
      });
      return () => {
        unsubscribe();
        unsubscribeTodayTotal();
      };
    } else {
      setIsInitialLoading(false);
    }
  }, [user]);

  const onShowAISummaryClicked = () => {
    if (isAnonymous) return; // gate handled by button disabled state
    if (isAISummarizationEnabled) {
      navigate("/ai-summary");
    } else {
      navigate("/settings", { state: { highlight: 'ai-summary' } });
    }
  }

  // Determine if the AI Summary button should be actionable
  const aiButtonDisabled = isAnonymous || !isSummarizeable;
  const aiTooltipContent = isAnonymous
    ? 'Link your Google account to unlock AI insights.'
    : 'You need at least 7 days of data to generate an AI summary.';
  const encouragement = isPumping
    ? 'The love you pour into every drop is felt and cherished.'
    : todayTotal === 0
      ? 'You are a wonderful mother, and your hard work does not go unnoticed.'
      : 'Keep it up!';

  if (isInitialLoading) {
    return (
      <Card className="w-full mb-4 shadow-md overflow-hidden border-solid border-purple-300 bg-purple-50 py-0 rounded-3xl">
        <div className="p-6 md:p-8 flex justify-center items-center min-h-[180px]">
          <Spinner className="text-purple-600" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full mb-4 shadow-md overflow-hidden border-solid border-purple-300 bg-purple-50 py-0 rounded-3xl">
        <div className="flex flex-col items-center gap-4 p-4 text-center md:p-6">
          <div className="w-full">
            <p className="text-sm font-semibold text-purple-700">Today's total</p>
            <p className="mt-1 flex items-baseline justify-center gap-2 text-purple-950">
              <span className="text-5xl font-bold leading-none tabular-nums tracking-tight sm:text-6xl">
                {todayTotal.toLocaleString()}
              </span>
              <span className="text-lg font-semibold text-purple-800">ml</span>
            </p>
          </div>

          <div className="flex w-full items-center gap-3 text-left">
            <img src="/baby.webp" alt="Baby" className="h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-base font-semibold text-purple-900">
                {isPumping ? 'Pumping...' : 'Welcome back, Mom!'}
              </h2>
              <p className="text-sm leading-relaxed text-purple-950">
                {encouragement}
              </p>
              <Tooltip content={aiTooltipContent} disabled={aiButtonDisabled}>
                <button
                  onClick={aiButtonDisabled ? undefined : onShowAISummaryClicked}
                  aria-disabled={aiButtonDisabled}
                  className={[
                    'mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-400 focus-visible:ring-offset-2 motion-reduce:transition-none',
                    !aiButtonDisabled
                      ? 'cursor-pointer bg-purple-500 text-white shadow-sm hover:bg-purple-600 active:bg-purple-700'
                      : 'cursor-not-allowed bg-purple-300 text-purple-950 opacity-70',
                  ].join(' ')}
                >
                  <Sparkles aria-hidden="true" className="size-4" />
                  Show AI Summary
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
};

export default PumpingInformation;
