import React, { useEffect, useState } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogOut } from 'lucide-react';
import BasePage from '@/components/BasePage';

import { saveUserSettings, subscribeToSettings } from '@/services/storage';

const SettingsPage: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [targetVolume, setTargetVolume] = useState('100');
  const [targetDuration, setTargetDuration] = useState('15');
  const [reminderHours, setReminderHours] = useState('4');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribeSettings = subscribeToSettings(user.uid, (settings) => {
        if (settings.targetVolume) setTargetVolume(settings.targetVolume);
        if (settings.targetDuration) setTargetDuration(settings.targetDuration);
        if (settings.reminderHours) setReminderHours(settings.reminderHours);
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
    } catch (error) {
      console.error("Error signing out", error);
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

  return (
    <BasePage showBackButton={true} pageTitle="Settings">
      <div className="w-full max-w-lg space-y-6">
        <Card className="bg-card/50 backdrop-blur-sm border-white/10">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Sign in to sync your data across devices.</CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
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
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
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
      </div>
    </BasePage>
  );
};

export default SettingsPage;
