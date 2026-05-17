import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { addSession } from '@/services/storage';
import { auth } from '@/firebase';

interface UnsavedSession {
  startedAt: string;
  elapsedSeconds: number;
  volume: string;
}

interface PumpingContextType {
  isPumping: boolean;
  elapsedSeconds: number;
  showSaveDialog: boolean;
  setShowSaveDialog: (show: boolean) => void;
  volume: string;
  setVolume: (volume: string) => void;
  targetDuration: string;
  setTargetDuration: (duration: string) => void;
  loading: boolean;
  isRestoredSession: boolean;
  handleStart: () => void;
  handleStop: () => void;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
}

const PumpingContext = createContext<PumpingContextType | null>(null);

export function PumpingProvider({ children }: { children: ReactNode }) {
  const [isPumping, setIsPumping] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [volume, setVolume] = useState('100');
  const [targetDuration, setTargetDuration] = useState('15');
  const [loading, setLoading] = useState(false);
  const [isRestoredSession, setIsRestoredSession] = useState(false);

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

  return (
    <PumpingContext.Provider value={{
      isPumping,
      elapsedSeconds,
      showSaveDialog,
      setShowSaveDialog,
      volume,
      setVolume,
      targetDuration,
      setTargetDuration,
      loading,
      isRestoredSession,
      handleStart,
      handleStop,
      handleSave,
      handleCancel
    }}>
      {children}
    </PumpingContext.Provider>
  );
}

export default function usePumpingControl() {
  const context = useContext(PumpingContext);
  if (!context) {
    throw new Error('usePumpingControl must be used within a PumpingProvider');
  }
  return context;
}
