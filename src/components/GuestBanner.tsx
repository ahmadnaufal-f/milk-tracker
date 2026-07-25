import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { auth } from '@/firebase';
import { linkWithPopup, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { toast } from 'sonner';

const DISMISS_KEY = 'guestBanner_lastDismissed';
const DISMISS_DAYS = 7;

export default function GuestBanner() {
  const { user, isAnonymous } = useAuth();
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true); // start hidden until we check localStorage

  useEffect(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const lastDismissed = Number(raw);
      const daysSince = (Date.now() - lastDismissed) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) {
        setDismissed(true);
        return;
      }
    }
    setDismissed(false);
  }, []);

  if (!isAnonymous || dismissed) return null;

  const handleLink = async () => {
    if (!user) return;
    setLinking(true);
    setMessage(null);
    try {
      const result = await linkWithPopup(user, new GoogleAuthProvider());
      // UID is unchanged — all Firestore data is preserved automatically
      await updateDoc(doc(db, 'users', result.user.uid), { isAnonymous: false });
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') {
        // The Google account already has its own Milk Tracker profile.
        // Sign in to the existing account (guest data will be cleaned up by the cron job).
        try {
          await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(err)!);
          setMessage('Signed in to your existing account.');
        } catch {
          setMessage('Could not switch accounts. Please try again.');
        }
      }
      // auth/popup-closed-by-user → silent ignore
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-amber-800 leading-snug">
        {message ?? 'Your data is temporary. Link your Google account to save it permanently.'}
      </span>
      <button
        onClick={handleLink}
        disabled={linking}
        className="shrink-0 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
      >
        {linking ? 'Linking…' : 'Link Account'}
      </button>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
          setDismissed(true);
          toast.info("We'll remind you again in 7 days.", { position: 'bottom-center' });
        }}
        className="shrink-0 text-amber-600 hover:text-amber-900 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
