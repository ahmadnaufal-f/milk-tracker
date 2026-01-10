import React, { useState, useEffect } from 'react';
import { addSession, subscribeToSessions, subscribeToSettings } from '@/services/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Save } from 'lucide-react';
import { auth } from '@/firebase';
import { Spinner } from './ui/spinner';

interface UnsavedSession {
  startedAt: string;
  elapsedSeconds: number;
  volume: string;
}

const PumpingTimer: React.FC = () => {
  const [isPumping, setIsPumping] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [volume, setVolume] = useState('100');
  const [targetDuration, setTargetDuration] = useState('15');
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRestoredSession, setIsRestoredSession] = useState(false);
  const [todayTotal, setTodayTotal] = useState(0);
  const [motivationText, setMotivationText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Detect keyboard visibility using visualViewport
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      // If viewport height is significantly smaller than window height, keyboard is likely open
      const heightDiff = window.innerHeight - viewport.height;
      setIsKeyboardVisible(heightDiff > 150);
    };

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Check for unsaved session first
    const unsavedSession = localStorage.getItem('unsavedSession');
    if (unsavedSession) {
      try {
        const session: UnsavedSession = JSON.parse(unsavedSession);
        setStartTime(new Date(session.startedAt));
        setElapsedSeconds(session.elapsedSeconds);
        setVolume(session.volume);
        setIsRestoredSession(true);
        setShowSaveDialog(true);
        return; // Don't restore timer if we have an unsaved session
      } catch (e) {
        console.error('Failed to parse unsaved session:', e);
        localStorage.removeItem('unsavedSession');
      }
    }

    // Restore timer state on mount
    const storedStartTime = localStorage.getItem('pumping_startTime');
    if (storedStartTime) {
      const start = new Date(storedStartTime);
      setStartTime(start);
      setIsPumping(true);

      // Calculate initial elapsed time immediately
      const now = new Date();
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
      setElapsedSeconds(diff);
    }
  }, []);

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
        settingsLoaded = true;
        checkLoaded();
      });
      const unsubscribeTodayTotal = subscribeToSessions(user.uid, (sessions) => {
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
    let interval: NodeJS.Timeout;

    if (isPumping && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setElapsedSeconds(diff);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPumping, startTime]);

  const handleStart = () => {
    const now = new Date();
    setStartTime(now);
    setIsPumping(true);
    setElapsedSeconds(0);
    localStorage.setItem('pumping_startTime', now.toISOString());
  };

  const handleStop = () => {
    if (!startTime) return;

    // Save session data to localStorage before showing dialog
    const unsavedSession: UnsavedSession = {
      startedAt: startTime.toISOString(),
      elapsedSeconds: elapsedSeconds,
      volume: volume,
    };
    localStorage.setItem('unsavedSession', JSON.stringify(unsavedSession));

    setIsPumping(false);
    setShowSaveDialog(true);
    localStorage.removeItem('pumping_startTime');
  };

  const handleSave = async () => {
    if (!startTime) return;

    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to save.");
      return;
    }

    setLoading(true);
    try {
      const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

      await addSession(user.uid, {
        volume: Number(volume),
        duration: durationMinutes,
        startedAt: startTime.toISOString()
      });

      // Remove unsaved session from localStorage after successful save
      localStorage.removeItem('unsavedSession');
      setIsRestoredSession(false);

      // Reset
      setShowSaveDialog(false);
      setStartTime(null);
      setElapsedSeconds(0);
      localStorage.removeItem('pumping_startTime');
      // Don't reset volume to '100', keep user preference or last fetched
    } catch (error) {
      console.error("Failed to save session:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    localStorage.removeItem('unsavedSession');
    setIsRestoredSession(false);
    setShowSaveDialog(false);
    setStartTime(null);
    setElapsedSeconds(0);
    localStorage.removeItem('pumping_startTime');
  };

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const remainingSeconds = Math.max(0, (Number(targetDuration) * 60) - elapsedSeconds);

  useEffect(() => {
    const text = isPumping ? 'The love you pour into every drop is felt and cherished.' :
      todayTotal === 0 ? 'You are a wonderful mother, and your hard work does not go unnoticed.' : `You have pumped ${todayTotal}ml today. Keep it up!`;
    setMotivationText(text);
  }, [isPumping, todayTotal]);

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
        <div className="p-6 md:p-8 pb-0 flex flex-col items-center space-y-8">
          {/* Header Section */}
          <div className="w-full flex flex-row justify-items-start items-center gap-6 text-left">
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
            </div>
          </div>

          {/* Timer Section */}
          {isPumping &&
            <div className="flex w-full items-center justify-around px-4 sm:px-12">
              {[{ text: 'Elapsed', time: elapsedSeconds }, { text: 'Remaining', time: remainingSeconds }].map((item) => (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs tracking-wider font-semibold text-purple-800">{item.text}</span>
                  <span className="text-3xl md:text-4xl font-mono font-medium tracking-tight text-purple-900">
                    {formatTime(item.time)}
                  </span>
                </div>
              ))}
            </div>
          }
        </div>

        {/* Buton Section */}
        <div className="w-full">
          <Button
            onClick={isPumping ? handleStop : handleStart}
            className="w-full h-12 text-md font-medium rounded-none transition-all bg-purple-200/80 active:scale-[0.99] text-purple-900"
          >
            {isPumping ? 'Stop Pumping' : 'Start Pumping'}
          </Button>
        </div>
      </Card>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className={`sm:max-w-md ${isKeyboardVisible ? 'top-[35%]' : ''}`}>
          <DialogHeader>
            <DialogTitle>{isRestoredSession ? 'You have unsaved session' : 'Great Job Mama!'}</DialogTitle>
            <div className="flex items-center gap-2 w-full justify-center p-2">
              <img src="/baby-happy.webp" alt="Baby" className="size-30" />
            </div>
            <DialogDescription>
              How much milk did you pump during {isRestoredSession ? 'the last' : 'this'} {Math.max(1, Math.round(elapsedSeconds / 60))} minute session?
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-4 py-4 px-2 w-full">
            <div className="flex flex-row items-center gap-4">
              <Label htmlFor="volume" className="min-w-fit">
                Volume (ml)
              </Label>
              <Input
                id="volume"
                type="number"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="font-mono text-lg"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleCancel} className="text-md">Cancel</Button>
            <Button onClick={handleSave} disabled={loading} className="bg-purple-200 text-purple-900 text-md">
              {loading ? <Spinner /> : <Save className="mr-1 size-4" />}
              Save session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PumpingTimer;
