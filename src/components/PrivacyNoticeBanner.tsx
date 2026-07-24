import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PRIVACY_BANNER_DISMISSED_KEY = 'privacy_notice_banner_dismissed';

/**
 * Whether a higher-priority "sign in to Google" banner is currently shown to
 * guest users. Only one banner may be visible at a time, and the sign-in banner
 * takes priority over this one.
 *
 * Guest / anonymous mode does not exist in the app yet, so this is always false
 * today. When a guest sign-in banner is added, return its visibility here and
 * the privacy banner will automatically defer to it — no other changes needed.
 */
function isGuestSignInBannerActive(): boolean {
  return false;
}

const PrivacyNoticeBanner: React.FC = () => {
  const navigate = useNavigate();

  // The "which banner shows" decision is made ONCE, at launch, via this
  // initializer. That means dismissing the sign-in banner mid-session never
  // flips this banner on — it can only appear on the next reload/launch when
  // the conditions are re-evaluated.
  const [visible, setVisible] = useState<boolean>(() => {
    if (isGuestSignInBannerActive()) return false; // one banner at a time
    return localStorage.getItem(PRIVACY_BANNER_DISMISSED_KEY) !== 'true';
  });

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(PRIVACY_BANNER_DISMISSED_KEY, 'true');
    setVisible(false);
  };

  const openPrivacyNotice = () => {
    // Reading the notice counts as acknowledging it — don't nag on return.
    localStorage.setItem(PRIVACY_BANNER_DISMISSED_KEY, 'true');
    navigate('/privacy');
  };

  return (
    <div
      className="w-full rounded-2xl p-4 flex items-start gap-3"
      style={{
        background: 'linear-gradient(135deg, var(--color-purple-100), var(--color-tertiary-200))',
        border: '1px solid var(--color-purple-200)',
      }}
    >
      <ShieldCheck className="w-6 h-6 mt-0.5 shrink-0" style={{ color: 'var(--color-purple-500)' }} />

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-md" style={{ color: 'var(--color-heading)' }}>
          New: Privacy Notice
        </p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-body)', opacity: 0.75 }}>
          We've published a privacy notice explaining how your data is handled and protected.
        </p>
        <Button size="sm" className="mt-3" onClick={openPrivacyNotice}>
          Read privacy notice
        </Button>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 transition-colors hover:bg-black/5"
        style={{ color: 'var(--color-body)', opacity: 0.6 }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default PrivacyNoticeBanner;
