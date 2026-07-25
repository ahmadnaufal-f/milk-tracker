import { ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from '@/firebase';
import { linkWithPopup, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';

const GUEST_DISMISS_KEY = 'guestBanner_lastDismissed';
const GUEST_DISMISS_DAYS = 7;
const PRIVACY_DISMISS_KEY = 'privacyBanner_dismissed';

// ── Reusable banner shell ─────────────────────────────────────────────────────

const TONES = {
  amber: {
    wrapper: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    action: 'bg-amber-500 hover:bg-amber-600',
    dismiss: 'text-amber-600 hover:text-amber-900',
  },
  purple: {
    wrapper: 'bg-purple-50 border-purple-200',
    text: 'text-purple-800',
    action: 'bg-purple-500 hover:bg-purple-600',
    dismiss: 'text-purple-600 hover:text-purple-900',
  },
} as const;

interface BannerProps {
  tone?: keyof typeof TONES;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  onDismiss: () => void;
}

export function Banner({
  tone = 'amber',
  message,
  actionLabel,
  onAction,
  actionDisabled,
  onDismiss,
}: BannerProps) {
  const styles = TONES[tone];

  return (
    <div
      className={`w-full border-b px-6 py-4 flex items-center justify-between gap-3 text-sm ${styles.wrapper}`}
    >
      <span className={`leading-snug ${styles.text}`}>{message}</span>
      {actionLabel && (
        <button
          onClick={onAction}
          disabled={actionDisabled}
          className={`shrink-0 text-xs font-semibold text-white disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors ${styles.action}`}
        >
          {actionLabel}
        </button>
      )}
      <button
        onClick={onDismiss}
        className={`shrink-0 transition-colors ${styles.dismiss}`}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Eligibility checks (read once per launch by AppBanner) ───────────────────

function isGuestBannerDue(): boolean {
  const raw = localStorage.getItem(GUEST_DISMISS_KEY);
  if (!raw) return true;
  const daysSince = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
  return daysSince >= GUEST_DISMISS_DAYS;
}

function isPrivacyBannerDue(): boolean {
  return localStorage.getItem(PRIVACY_DISMISS_KEY) !== 'true';
}

// ── Guest banner ──────────────────────────────────────────────────────────────

export function GuestBanner() {
  const { user, isAnonymous } = useAuth();
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Self-sufficient: respects its own snooze even if rendered without AppBanner.
  const [dismissed, setDismissed] = useState(() => !isGuestBannerDue());

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
    <Banner
      tone="amber"
      message={message ?? 'Your data is temporary. Link your Google account to save it permanently.'}
      actionLabel={linking ? 'Linking…' : 'Link Account'}
      onAction={handleLink}
      actionDisabled={linking}
      onDismiss={() => {
        localStorage.setItem(GUEST_DISMISS_KEY, String(Date.now()));
        setDismissed(true);
        toast.info("We'll remind you again in 7 days.", { position: 'bottom-center' });
      }}
    />
  );
}

// ── Privacy notice banner ─────────────────────────────────────────────────────

export function PrivacyNoticeBanner() {
  const navigate = useNavigate();
  // Self-sufficient: respects its own dismissal even if rendered without AppBanner.
  const [dismissed, setDismissed] = useState(() => !isPrivacyBannerDue());

  if (dismissed) return null;

  // Dismissed for good — there is no "remind me later" for this one.
  const remember = () => localStorage.setItem(PRIVACY_DISMISS_KEY, 'true');

  return (
    <Banner
      tone="purple"
      message={
        <>
          We've published a <span className="font-semibold">Privacy Notice</span> explaining how your
          data is handled.
        </>
      }
      actionLabel="Read Notice"
      onAction={() => {
        // Reading it counts as acknowledging it — don't nag afterwards.
        remember();
        navigate('/privacy');
      }}
      onDismiss={() => {
        remember();
        setDismissed(true);
      }}
    />
  );
}

// ── Coordinator: at most one banner at a time ────────────────────────────────

type ActiveBanner = 'guest' | 'privacy' | null;

/**
 * Decides which banner (if any) is shown for this launch.
 *
 * The decision is made ONCE, as soon as auth resolves, and is then frozen. That
 * is what guarantees dismissing the guest banner does not immediately reveal the
 * privacy banner — it can only take its turn on the next reload/launch.
 */
export default function AppBanner() {
  const { isAnonymous, loading } = useAuth();
  const location = useLocation();
  const [active, setActive] = useState<ActiveBanner | undefined>(undefined);

  useEffect(() => {
    if (loading || active !== undefined) return; // wait for auth, then decide once
    if (isAnonymous && isGuestBannerDue()) setActive('guest');
    else if (isPrivacyBannerDue()) setActive('privacy');
    else setActive(null);
  }, [loading, isAnonymous, active]);

  if (active === 'guest') return <GuestBanner />;
  // The privacy notice is announced on the main tracker page only.
  if (active === 'privacy' && location.pathname === '/tracker') return <PrivacyNoticeBanner />;
  return null;
}
