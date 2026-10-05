import { ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { auth, googleProvider } from '@/firebase';
import { signInWithPopup } from 'firebase/auth';
import { toast } from 'sonner';
import { linkGuestAccount } from '@/services/accountLinking';
import { isDomainMigrationActive } from '@/config/domainMigration';
import DomainMigrationNotice from '@/components/DomainMigrationNotice';

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
  const [collision, setCollision] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  // Self-sufficient: respects its own snooze even if rendered without AppBanner.
  const [dismissed, setDismissed] = useState(() => !isGuestBannerDue());

  const handleLink = async () => {
    if (!user) return;
    setLinking(true);
    setMessage(null);
    setCollision(false);
    setReauthRequired(false);
    try {
      const result = await linkGuestAccount(user);
      if (result.status === 'linked') setMessage('Your Google account is linked to these records.');
      else if (result.status === 'reauth-required') {
        setReauthRequired(true);
        setMessage('Your Google account is linked. Sign in again with that same Google account to finish opening your records.');
      }
      else if (result.status === 'collision') {
        setCollision(true);
        setMessage('This Google account already has a Milk Tracker profile. Your guest records are still here.');
      } else if (result.status === 'error') {
        setMessage('We could not link this account. Your guest records are still here. Please try again.');
      }
    } catch {
      setMessage('We could not link this account. Your guest records are still here. Please try again.');
    } finally {
      setLinking(false);
    }
  };

  const handleReauthenticate = async () => {
    setLinking(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setReauthRequired(false);
      setMessage(null);
    } catch {
      setMessage('Please sign in again with the same Google account when you are ready.');
    } finally {
      setLinking(false);
    }
  };

  if ((!isAnonymous && !reauthRequired) || dismissed) return null;

  return (
    <Banner
      tone="amber"
      message={
        <>
          {message ?? 'Your data is temporary. Link a Google account if you would like to keep it.'}
          {collision && (
            <>
              {' '}
              <Link to="/migration" className="font-semibold underline underline-offset-2">
                Move my guest data
              </Link>
            </>
          )}
        </>
      }
      actionLabel={linking ? (reauthRequired ? 'Signing in…' : 'Linking…') : reauthRequired ? 'Sign in again' : 'Link Account'}
      onAction={reauthRequired ? handleReauthenticate : handleLink}
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

type ActiveBanner = 'migration' | 'guest' | 'privacy' | null;

const GUEST_BANNER_ROUTES = new Set(['/tracker', '/history', '/ai-summary']);

/**
 * The move notice can appear on any route. Guest and privacy notices keep their
 * original eligibility and are chosen once, when the first tracker route opens.
 */
export default function AppBanner() {
  const { isAnonymous, loading } = useAuth();
  const location = useLocation();
  const [active, setActive] = useState<ActiveBanner | undefined>(undefined);

  useEffect(() => {
    if (isDomainMigrationActive()) {
      setActive('migration');
      return;
    }
    if (active !== undefined || loading || !GUEST_BANNER_ROUTES.has(location.pathname)) return;
    if (isAnonymous && isGuestBannerDue()) setActive('guest');
    else if (location.pathname === '/tracker' && isPrivacyBannerDue()) setActive('privacy');
    else setActive(null);
  }, [active, isAnonymous, loading, location.pathname]);

  if (active === 'migration') {
    return location.pathname === '/migration' ? null : <DomainMigrationNotice />;
  }
  if (active === 'guest' && GUEST_BANNER_ROUTES.has(location.pathname)) return <GuestBanner />;
  // The privacy notice is announced on the main tracker page only.
  if (active === 'privacy' && location.pathname === '/tracker') return <PrivacyNoticeBanner />;
  return null;
}
