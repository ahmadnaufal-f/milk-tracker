import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, signOut, linkWithPopup, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { collection, addDoc, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogOut, ShieldCheck, ChevronRight } from 'lucide-react';
import BasePage from '@/components/BasePage';
import { useAuth } from '@/contexts/AuthContext';
import { saveUserSettings, subscribeToSettings } from '@/services/storage';
import ToggleSwitch from '@/components/ui/toggle-switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const AI_CONTEXT_FIRST_RUN_KEY = 'ai_summarization_first_run_done';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAnonymous } = useAuth();
  const [isShaking, setIsShaking] = useState(location.state?.highlight === 'ai-summary');
  const [targetVolume, setTargetVolume] = useState('100');
  const [targetDuration, setTargetDuration] = useState('15');
  const [reminderHours, setReminderHours] = useState('4');
  const [saving, setSaving] = useState(false);
  const [aiSummarizationEnabled, setAiSummarizationEnabled] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isShaking) {
      const timer = setTimeout(() => setIsShaking(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isShaking]);

  useEffect(() => {
    if (user) {
      const unsubscribeSettings = subscribeToSettings(user.uid, (settings) => {
        if (settings.targetVolume) setTargetVolume(settings.targetVolume);
        if (settings.targetDuration) setTargetDuration(settings.targetDuration);
        if (settings.reminderHours) setReminderHours(settings.reminderHours);
        if (settings.aiContext !== undefined) {
          setAiSummarizationEnabled(settings.aiContext.enabled);
        }
      });
      return () => unsubscribeSettings();
    }
  }, [user]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const handleLinkAccount = async () => {
    if (!user) return;
    setLinking(true);
    setLinkMessage(null);
    try {
      const result = await linkWithPopup(user, new GoogleAuthProvider());
      await updateDoc(doc(db, 'users', result.user.uid), { isAnonymous: false });
      setLinkMessage('Account linked successfully!');
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(err)!);
        setLinkMessage('Signed in to your existing account.');
      } else if (err.code !== 'auth/popup-closed-by-user') {
        setLinkMessage('Could not link account. Please try again.');
      }
    } finally {
      setLinking(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveUserSettings(user.uid, {
        targetVolume,
        targetDuration,
        reminderHours
      });
      alert('Settings saved to cloud!');
    } catch (error) {
      console.error("Failed to save settings", error);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAiSummarizationToggle = async (enabled: boolean) => {
    if (!user) return;

    // On first enable, show the dialog instead of proceeding immediately
    if (enabled && !localStorage.getItem(AI_CONTEXT_FIRST_RUN_KEY)) {
      setShowAiDialog(true);
      return;
    }

    setAiSummarizationEnabled(enabled);
    try {
      await saveUserSettings(user.uid, {
        aiContext: { enabled },
      });
    } catch (error) {
      console.error("Failed to save AI summarization setting", error);
      // Revert optimistic update on failure
      setAiSummarizationEnabled(!enabled);
    }
  };

  const handleAiSummarizationItemClick = () => {
    if (aiSummarizationEnabled && localStorage.getItem(AI_CONTEXT_FIRST_RUN_KEY)) {
      navigate('/settings/ai-context');
    } else {
      setShowAiDialog(true);
    }
  };

  const handleConfirmAiEnable = async () => {
    if (!user) return;
    setShowAiDialog(false);
    setAiSummarizationEnabled(true);
    try {
      await saveUserSettings(user.uid, {
        aiContext: { enabled: true },
      });
      localStorage.setItem(AI_CONTEXT_FIRST_RUN_KEY, 'true');
      navigate('/settings/ai-context');
    } catch (error) {
      console.error("Failed to save AI summarization setting", error);
      setAiSummarizationEnabled(false);
    }
  };

  const handlePopulateMockData = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const sessionsRef = collection(db, 'users', user.uid, 'sessions');
      const targetDate = new Date('2026-05-10T00:00:00Z');
      const currentDate = new Date();

      const days: Date[] = [];
      let current = new Date(targetDate);
      while (current <= currentDate) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }

      let totalAdded = 0;

      for (const day of days) {
        for (let i = 0; i < 5; i++) {
          const hour = Math.floor(Math.random() * 24);
          const minute = Math.floor(Math.random() * 60);

          const sessionDate = new Date(day);
          sessionDate.setHours(hour, minute, 0, 0);

          if (sessionDate > currentDate) continue;

          const volume = Math.floor(Math.random() * (250 - 50 + 1)) + 50;
          const duration = Math.floor(Math.random() * (30 - 10 + 1)) + 10;

          await addDoc(sessionsRef, {
            volume,
            duration,
            startedAt: sessionDate.toISOString(),
            createdAt: Timestamp.fromDate(sessionDate)
          });
          totalAdded++;
        }
      }
      alert(`Successfully added ${totalAdded} mock sessions!`);
    } catch (error) {
      console.error("Error populating data", error);
      alert('Failed to populate mock data.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BasePage showBackButton={true} pageTitle="Settings">
      <div className="w-full max-w-lg space-y-6">
        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              {isAnonymous ? 'Link your Google account to keep your data.' : 'Sign in to sync your data across devices.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAnonymous ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-amber-700 text-sm leading-snug">
                    You're using a <span className="font-semibold">guest account</span>. Your data is stored temporarily.
                  </div>
                </div>
                {linkMessage && (
                  <p className="text-sm text-center text-muted-foreground">{linkMessage}</p>
                )}
                <Button
                  onClick={handleLinkAccount}
                  disabled={linking}
                  size="lg"
                  className="w-full bg-white text-black hover:bg-gray-100 py-4"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {linking ? 'Linking…' : 'Link Google Account'}
                </Button>
              </div>
            ) : user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {user.photoURL && (
                    <img src={user.photoURL} alt={user.displayName || "User"} className="w-10 h-10 rounded-full border border-white/20" />
                  )}
                  <div>
                    <p className="font-medium">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground text-wrap whitespace-nowrap overflow-hidden max-w-[140px] truncate">{user.email}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="size-4 mr-1" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button onClick={handleSignIn} className="w-full bg-white text-black hover:bg-gray-100">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
          <CardHeader>
            <CardTitle>Targets</CardTitle>
            <CardDescription>Set your pumping goals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="targetVolume">Target Volume (ml)</Label>
              <Input
                id="targetVolume"
                type="number"
                value={targetVolume}
                onChange={(e) => setTargetVolume(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="targetDuration">Target Duration (minutes)</Label>
              <Input
                id="targetDuration"
                type="number"
                value={targetDuration}
                onChange={(e) => setTargetDuration(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reminderHours">Reminder After (hours)</Label>
              <Input
                id="reminderHours"
                type="number"
                min="1"
                max="24"
                value={reminderHours}
                onChange={(e) => setReminderHours(e.target.value)}
                className="bg-background/50"
              />
              <p className="text-xs text-muted-foreground">You'll be reminded to pump again after this many hours.</p>
            </div>
            <Button onClick={handleSaveConfig} className="w-full" disabled={saving}>
              {saving ? "Saving..." : "Save Targets"}
            </Button>
          </CardContent>
        </Card>

        <Card
          className={`bg-card/50 backdrop-blur-sm border-white/10 ${isShaking ? 'animate-shake shadow-[0_0_15px_rgba(168,85,247,0.5)] border-purple-400' : ''}`}
        >
          <CardHeader className="pb-2">
            <CardTitle>AI Summarization</CardTitle>
            <CardDescription>Personalise your AI weekly summaries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="flex flex-row items-center gap-3 cursor-pointer transition-all duration-200 hover:border-purple-300/40 active:scale-[0.99]"
              onClick={handleAiSummarizationItemClick}
            >
              <Label className="grow">Enable AI Summarization</Label>
              <div className="w-px h-[30px] bg-grey-700"></div>
              <span onClick={(e) => e.stopPropagation()}>
                <ToggleSwitch checked={aiSummarizationEnabled} onChange={(e) => handleAiSummarizationToggle(e.target.checked)} />
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
          <CardHeader className="pb-2">
            <CardTitle>About</CardTitle>
            <CardDescription>Legal and privacy information.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="flex flex-row items-center gap-3 cursor-pointer transition-all duration-200 active:scale-[0.99]"
              onClick={() => navigate('/privacy')}
            >
              <ShieldCheck className="size-5 text-muted-foreground" />
              <Label className="grow cursor-pointer">Privacy Notice</Label>
              <ChevronRight className="size-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {import.meta.env.DEV && (
          <Card className="bg-card/50 backdrop-blur-sm border-white/10 mt-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-red-500">Developer Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handlePopulateMockData}
                variant="outline"
                className="w-full border-red-500/50 hover:bg-red-500/10 text-red-500 hover:text-red-400"
                disabled={!user || saving}
              >
                {saving ? "Populating..." : "Populate Mock Data"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Before we turn on AI Summaries</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-4">
            <p>This feature sends your de-identified pumping data (without your name or email) to an AI provider to generate your weekly summary.</p>
            <div>
              <p className="font-semibold text-foreground">What is shared:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Session volumes, times, and durations</li>
                <li>Baby's age and pumping goal (if you've provided them)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground">What is never shared:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Your name, email, or any identifying information</li>
              </ul>
            </div>
            <p className="text-amber-600 bg-amber-50 p-3 rounded-md text-xs font-medium border border-amber-200">
              ⚠️ AI summaries are not medical advice. Always consult a lactation consultant or healthcare provider for guidance.
            </p>
            <p className="text-xs">
              You can disable this feature at any time in Settings. Disabling AI does not affect your pump logs.
            </p>
          </div>
          <DialogFooter className="flex-row justify-end space-x-2 pt-4">
            <Button variant="ghost" onClick={() => setShowAiDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirmAiEnable} className="bg-purple-600 hover:bg-purple-700 text-white">Enable AI summarization</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BasePage>
  );
};

export default SettingsPage;
