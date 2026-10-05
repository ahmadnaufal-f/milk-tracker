import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, LogOut, User as UserIcon, BookOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { setupPushNotifications } from '@/services/notifications';
import TutorialDialog from './TutorialDialog';

interface BasePageProps {
  children: React.ReactNode;
  className?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  pageTitle?: string;
  showAvatar?: boolean;
}

const BasePage: React.FC<BasePageProps> = ({
  children,
  className = '',
  showBackButton = false,
  onBack,
  pageTitle,
  showAvatar = false,
}) => {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const [enablingReminders, setEnablingReminders] = useState(false);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(() =>
    typeof Notification !== 'undefined' && Notification.permission === 'granted');

  // Request notification permission when user is logged in
  useEffect(() => {
    const setupNotifications = async () => {
      if (user && showAvatar && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (vapidKey) {
          await setupPushNotifications(user.uid, vapidKey);
        }
      }
    };
    setupNotifications();
  }, [user, showAvatar]);

  const enableReminders = async () => {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!user || !vapidKey) return;
    setEnablingReminders(true);
    try {
      const enabled = await setupPushNotifications(user.uid, vapidKey);
      setRemindersEnabled(enabled);
      setReminderMessage(enabled
        ? 'Reminders are enabled for this app.'
        : 'Reminders are not enabled yet. You can allow notifications in your browser settings and try again.');
    } catch {
      setReminderMessage("We couldn't enable reminders just now. You can try again later.");
    } finally {
      setEnablingReminders(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const showHeader = showBackButton || pageTitle || showAvatar;

  const [showTutorial, setShowTutorial] = useState(false);

  return (
    <div className={`min-h-screen flex flex-col items-center p-4 relative overflow-hidden ${className}`}>
      {showHeader && (
        <header className="w-full max-w-md flex justify-between items-center mb-4 z-10">
          <div className="flex items-center space-x-3">
            {showBackButton && (
              <Button variant="ghost" size="icon" onClick={() => onBack ? onBack() : navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            {pageTitle && (
              <h1 className="text-2xl font-semibold">{pageTitle}</h1>
            )}
          </div>

          {showAvatar && (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {!isAnonymous && (
                  <>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.displayName}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTutorial(true)} className="cursor-pointer">
                  <BookOpen className="mr-2 h-4 w-4" />
                  <span>How to Use</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-500 focus:text-red-500 focus:bg-red-100/10">
                  <LogOut className="mr-2 h-4 w-4 text-red-500" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
      )}
      {children}
      {showAvatar && user && !remindersEnabled && import.meta.env.VITE_FIREBASE_VAPID_KEY && typeof Notification !== 'undefined' && (
        <Button variant="outline" disabled={enablingReminders} onClick={() => void enableReminders()} className="mt-6 min-h-11">
          {enablingReminders ? 'Enabling reminders…' : 'Enable reminders on this app'}
        </Button>
      )}
      {reminderMessage && <p role="status" className="mt-3 max-w-md text-sm text-center text-muted-foreground">{reminderMessage}</p>}
      <div className="h-16 w-full" />
      <TutorialDialog open={showTutorial} onOpenChange={setShowTutorial} />
    </div>
  );
};

export default BasePage;
