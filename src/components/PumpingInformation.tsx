import React, { useState, useEffect } from 'react';
import { PumpingSession, subscribeToSessions, subscribeToSettings } from '@/services/storage';
import usePumpingControl from '@/hooks/usePumpingControl';
import { Card } from '@/components/ui/card';
import { auth } from '@/firebase';
import { Spinner } from './ui/spinner';
import useSummarizeableCheck from '@/hooks/useSummarizeableCheck';
import { useNavigate } from 'react-router-dom';

const PumpingInformation: React.FC = () => {
  const {
    isPumping,
    setVolume,
    setTargetDuration
  } = usePumpingControl();

  const navigate = useNavigate();
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);
  const [motivationText, setMotivationText] = useState('');
  const [sessions, setSessions] = useState<PumpingSession[]>([]);
  const [isAISummarizationEnabled, setIsAISummarizationEnabled] = useState(false);
  const { isSummarizeable } = useSummarizeableCheck(sessions);

  useEffect(() => {
    const user = auth.currentUser;
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
  }, [auth.currentUser]);

  useEffect(() => {
    const text = isPumping ? 'The love you pour into every drop is felt and cherished.' :
      todayTotal === 0 ? 'You are a wonderful mother, and your hard work does not go unnoticed.' : `You have pumped ${todayTotal}ml today. Keep it up!`;
    setMotivationText(text);
  }, [isPumping, todayTotal]);

  const onShowAISummaryClicked = () => {
    if (isAISummarizationEnabled) {
      navigate("/ai-summary");
    } else {
      navigate("/settings", { state: { highlight: 'ai-summary' } });
    }
  }

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
        <div className="p-4 md:p-8 flex flex-col items-center space-y-8">
          <div className="w-full flex flex-row justify-items-start items-center gap-4 text-left">
            <div className="relative shrink-0">
              <div className="w-30 h-30 flex items-center justify-center overflow-hidden">
                <img src="/baby.webp" alt="Baby" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-purple-900">
                {isPumping ? 'Pumping...' : 'Welcome back, Mom!'}
              </h2>
              <p className="text-sm text-purple-950">
                {motivationText}
              </p>
              <div>
                {isSummarizeable ? (
                  <button onClick={onShowAISummaryClicked} className='mt-1 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white text-[14px] px-4 py-2 rounded-lg shadow-[0_0_8px_2px_rgba(168,85,247,0.5)]'>
                    ✨ Show AI Summary
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
};

export default PumpingInformation;
