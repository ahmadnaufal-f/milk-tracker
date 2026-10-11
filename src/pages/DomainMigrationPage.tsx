import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import BasePage from '@/components/BasePage';
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import usePumpingControl from '@/hooks/usePumpingControl';
import {
  completeGuestMigration,
  createGuestTransfer,
  resumeGuestMigration,
  takeGuestTransferCodeFromFragment,
} from '@/services/guestMigration';
import { prepareForDomainMigration } from '@/services/storage';
import { isStandalonePwa } from '@/lib/pwa';
import {
  formatMigrationRetirementDate,
  getDomainMigrationConfig,
  isMigrationDestinationAvailable,
  isOldMigrationOrigin,
} from '@/config/domainMigration';

type GuestMigrationResult = Awaited<ReturnType<typeof completeGuestMigration>>;
type GuestTransfer = Awaited<ReturnType<typeof createGuestTransfer>>;
type PreparationResult = Awaited<ReturnType<typeof prepareForDomainMigration>>;
interface DomainMigrationPageProps {
  navigate?: (url: string) => void;
}

type PageStatus = 'idle' | 'working' | 'identity-conflict' | 'error' | 'complete';

function explainPreparationFailure(result: PreparationResult): string {
  if (result.safe) return '';
  switch (result.reason) {
    case 'active-session':
      return 'Finish your current pumping session and save it before moving.';
    case 'saving':
      return 'Your latest session is still saving. Try again when it has finished.';
    case 'unsaved-session':
      return 'There is a session waiting to be saved on this device. Save it before moving.';
    case 'offline':
      return 'Connect to the internet, then try again.';
    case 'sync-timeout':
    case 'sync-failed':
      return 'We could not check your latest records. Check your connection, then try again.';
    case 'missing-user':
      return 'Open this guide from the guest account on the old app.';
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function describeExpiry(value: unknown): string | null {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return null;
  return `This private link expires at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}.`;
}

function getLocalSessionBlock(isPumping: boolean, isBusy: boolean, showSaveDialog: boolean): string | null {
  if (isPumping) return 'Finish your current pumping session and save it before moving.';
  if (isBusy) return 'Wait for your current session to finish saving before moving.';
  try {
    if (localStorage.getItem('unsavedSession')) {
      return 'There is a session waiting to be saved on this device. Save it before moving.';
    }
    if (showSaveDialog) return 'There is a session waiting to be saved on this device. Save it before moving.';
    if (localStorage.getItem('pumping_startTime')) {
      return 'Finish your current pumping session and save it before moving.';
    }
    return null;
  } catch {
    return 'We could not check this device for an unfinished session. Please try again.';
  }
}

function buildGuestTransferUrl(transfer: GuestTransfer, expectedDestination: string): string {
  const destination = new URL(transfer.destinationOrigin);
  if (destination.protocol !== 'https:' || destination.origin !== expectedDestination) {
    throw new Error('The transfer destination did not match this app’s configured address.');
  }
  const url = new URL('/migration', destination.origin);
  url.hash = new URLSearchParams({ transfer: transfer.code }).toString();
  return url.toString();
}

function getHomeScreenGuidance(): string {
  if (isStandalonePwa()) return 'You’re already using the installed Milk Tracker app.';
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/android/i.test(userAgent)) {
    return 'To add Milk Tracker to your home screen, open the browser menu and choose Install app or Add to Home screen.';
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'To add Milk Tracker to your home screen, open this page in Safari, tap Share, then Add to Home Screen.';
  }
  return 'On Android, choose Install app or Add to Home screen from your browser menu. On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen.';
}

export default function DomainMigrationPage({
  navigate = (url) => window.location.assign(url),
}: DomainMigrationPageProps) {
  const config = getDomainMigrationConfig();
  const { user, isAnonymous, loading: authLoading, hasGuestMigration } = useAuth();
  const { isPumping, isBusy, showSaveDialog } = usePumpingControl();
  const pumpingStateRef = useRef({ isPumping, isBusy, showSaveDialog });
  pumpingStateRef.current = { isPumping, isBusy, showSaveDialog };
  const [incomingCode, setIncomingCode] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<GuestTransfer | null>(null);
  const [transferUrl, setTransferUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PageStatus>('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<GuestMigrationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const captureStarted = useRef(false);
  const completionStarted = useRef(false);
  const stateHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousFocusState = useRef({
    status,
    transfer,
    incomingCode,
    localBlock: null as string | null,
    userUid: user?.uid ?? null,
  });
  const currentOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
  const isSource = isOldMigrationOrigin(currentOrigin, config);
  const isDestination = Boolean(
    config.enabled &&
    config.oldOrigins.length > 0 &&
    config.destinationOrigin &&
    !config.oldOrigins.includes(config.destinationOrigin) &&
    currentOrigin === config.destinationOrigin &&
    config.destinationReady,
  );
  const canMove = isSource && isMigrationDestinationAvailable(config, currentOrigin);
  const retirementDate = formatMigrationRetirementDate(config.retirementDate);
  const localSessionBlock = getLocalSessionBlock(isPumping, isBusy, showSaveDialog);

  useEffect(() => {
    if (captureStarted.current) return;
    captureStarted.current = true;
    const code = takeGuestTransferCodeFromFragment();
    if (!code) return;
    if (isDestination) {
      setIncomingCode(code);
    } else {
      setMessage('Open this private link on the new Milk Tracker site. Return to the old app and try again.');
    }
  }, [isDestination]);

  useEffect(() => {
    const previous = previousFocusState.current;
    const next = { status, transfer, incomingCode, localBlock: localSessionBlock, userUid: user?.uid ?? null };
    const stageChanged =
      previous.status !== next.status ||
      previous.transfer !== next.transfer ||
      previous.incomingCode !== next.incomingCode ||
      previous.localBlock !== next.localBlock ||
      previous.userUid !== next.userUid;
    if (
      stageChanged &&
      (next.status === 'error' || next.status === 'complete' || next.status === 'identity-conflict' || next.transfer || next.incomingCode || next.localBlock)
    ) {
      if (next.incomingCode && user && !localSessionBlock) {
        document.getElementById('account-switch-heading')?.focus();
      } else {
        stateHeadingRef.current?.focus();
      }
    }
    previousFocusState.current = next;
  }, [incomingCode, localSessionBlock, status, transfer, user]);

  const checkRecords = async (): Promise<PreparationResult> => {
    const state = pumpingStateRef.current;
    return prepareForDomainMigration(user?.uid ?? null, {
      isPumping: state.isPumping,
      isBusy: state.isBusy,
      timeoutMs: 8000,
    });
  };

  const checkLiveLocalState = () => {
    const state = pumpingStateRef.current;
    return getLocalSessionBlock(state.isPumping, state.isBusy, state.showSaveDialog);
  };

  const isStillSignedInAs = (uid: string) => auth.currentUser?.uid === uid;
  const accountChangedMessage = 'Your signed-in account changed. Return to the account you want to move and try again.';

  const handlePrepareMove = async () => {
    if (!user || !canMove || status === 'working') return;
    const expectedUid = user.uid;
    if (!isStillSignedInAs(expectedUid)) {
      setMessage(accountChangedMessage);
      setStatus('error');
      return;
    }
    setStatus('working');
    setMessage('Checking your saved records…');
    setTransfer(null);
    setTransferUrl(null);

    try {
      const prepared = await checkRecords();
      if (!isStillSignedInAs(expectedUid)) {
        setMessage(accountChangedMessage);
        setStatus('error');
        return;
      }
      if (!prepared.safe) {
        setMessage(explainPreparationFailure(prepared));
        setStatus('error');
        return;
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setMessage(localBlock);
        setStatus('error');
        return;
      }

      if (isAnonymous) {
        const created = await createGuestTransfer({
          campaignId: config.campaignId,
          destinationOrigin: config.destinationOrigin!,
        });
        if (!isStillSignedInAs(expectedUid)) {
          setMessage('Your account changed while the link was prepared, so we did not show it. Return to the guest account and try again.');
          setStatus('error');
          return;
        }
        const localBlockAfterIssue = checkLiveLocalState();
        if (localBlockAfterIssue) {
          setMessage(`${localBlockAfterIssue} The private link was not shown; it will expire automatically.`);
          setStatus('error');
          return;
        }
        const privateUrl = buildGuestTransferUrl(created, config.destinationOrigin!);
        setTransfer(created);
        setTransferUrl(privateUrl);
        setMessage('Your private link is ready.');
        setStatus('idle');
        return;
      }

      if (!isStillSignedInAs(expectedUid)) {
        setMessage(accountChangedMessage);
        setStatus('error');
        return;
      }
      navigate(config.destinationOrigin!);
    } catch {
      setMessage('We could not prepare the move. Your records are still on this app. Try again.');
      setStatus('error');
    }
  };

  const runGuestCompletion = async () => {
    if (!isDestination || !incomingCode || completionStarted.current) return;
    if (auth.currentUser) {
      setMessage('This browser is signed in to another account. Choose to switch before opening the guest records.');
      setStatus('identity-conflict');
      return;
    }
    const localBlock = checkLiveLocalState();
    if (localBlock) {
      setMessage(localBlock);
      setStatus(user ? 'identity-conflict' : 'idle');
      return;
    }
    const code = incomingCode;
    completionStarted.current = true;
    setIncomingCode(null);
    setStatus('working');
    setMessage('Opening your guest records…');
    try {
      const migrationResult = await completeGuestMigration(code);
      if (!isStillSignedInAs(migrationResult.sourceUid)) {
        setStatus('error');
        setMessage('Your signed-in account changed before the records could be confirmed. Return to the old app and try again.');
        completionStarted.current = false;
        return;
      }
      setResult(migrationResult);
      setStatus('complete');
      completionStarted.current = false;
      setMessage('Your records are ready on this app.');
    } catch (error) {
      const errorCode = getErrorCode(error);
      if (errorCode === 'guest-migration/identity-conflict') {
        setIncomingCode(code);
        completionStarted.current = false;
        setStatus('identity-conflict');
        setMessage('This browser is signed in to another account. Switch accounts before opening the guest records. The other account’s records stay with that account.');
        return;
      }
      setStatus('error');
      completionStarted.current = false;
      setMessage('We could not verify this transfer yet. Your original records remain on the old app.');
    }
  };

  const handleExplicitAccountSwitch = async () => {
    if (!isDestination || !incomingCode || !user) return;
    const expectedUid = user.uid;
    if (!isStillSignedInAs(expectedUid)) {
      setStatus('identity-conflict');
      setMessage(accountChangedMessage);
      return;
    }
    setStatus('working');
    setMessage('Checking your saved changes before switching accounts…');
    try {
      const prepared = await checkRecords();
      if (!isStillSignedInAs(expectedUid)) {
        setStatus('identity-conflict');
        setMessage(accountChangedMessage);
        return;
      }
      if (!prepared.safe) {
        setStatus('identity-conflict');
        setMessage(explainPreparationFailure(prepared));
        return;
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setStatus('identity-conflict');
        setMessage(localBlock);
        return;
      }
      if (!isStillSignedInAs(expectedUid)) {
        setStatus('identity-conflict');
        setMessage(accountChangedMessage);
        return;
      }
      setMessage('Opening the guest records…');
      await signOut(auth);
      await runGuestCompletion();
    } catch {
      setStatus('identity-conflict');
      setMessage('We could not switch accounts just now. Your current account is still signed in. Try again when you are ready.');
    }
  };

  const handleResume = async () => {
    if (!isDestination || !user || !hasGuestMigration || status === 'working') return;
    const expectedUid = user.uid;
    if (!isStillSignedInAs(expectedUid)) {
      setStatus('error');
      setMessage(accountChangedMessage);
      return;
    }
    setStatus('working');
    setMessage('Checking your records…');
    try {
      const migrationResult = await resumeGuestMigration();
      if (!isStillSignedInAs(expectedUid) || migrationResult.sourceUid !== expectedUid) {
        setStatus('error');
        setMessage('Your signed-in account changed before the records could be confirmed. Sign back into the guest account to try again.');
        return;
      }
      setResult(migrationResult);
      setStatus('complete');
      setMessage('Your records are ready on this app.');
    } catch {
      setStatus('error');
      setMessage('We could not check your records just now. They remain on the old app. Try again when your connection is steady.');
    }
  };

  const handleCopyAddress = async () => {
    if (!config.destinationOrigin) return;
    if (transfer && Date.now() >= Number(transfer.expiresAt)) {
      setTransfer(null);
      setTransferUrl(null);
      setMessage('This private link has expired. Create a fresh link when you are ready.');
      setStatus('error');
      return;
    }
    try {
      if (isSource && user) {
        const expectedUid = user.uid;
        if (!isStillSignedInAs(expectedUid)) {
          setMessage(accountChangedMessage);
          setStatus('error');
          return;
        }
        const prepared = await checkRecords();
        if (!isStillSignedInAs(expectedUid)) {
          setMessage(accountChangedMessage);
          setStatus('error');
          return;
        }
        if (!prepared.safe) {
          setMessage(explainPreparationFailure(prepared));
          setStatus('error');
          return;
        }
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setMessage(localBlock);
        setStatus('error');
        return;
      }
      if (isSource && user && !isStillSignedInAs(user.uid)) {
        setMessage(accountChangedMessage);
        setStatus('error');
        return;
      }
      const address = transferUrl || config.destinationOrigin;
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage('We could not copy the address just now. Your records are still here. Try again when you are ready.');
      setStatus('error');
    }
  };

  const handleOpenDestination = async () => {
    if (!isSource || !user || !canMove || !config.destinationOrigin || status === 'working') return;
    const expectedUid = user.uid;
    if (!isStillSignedInAs(expectedUid)) {
      setMessage(accountChangedMessage);
      setStatus('error');
      return;
    }
    if (isAnonymous && transfer && Date.now() >= Number(transfer.expiresAt)) {
      setTransfer(null);
      setTransferUrl(null);
      setMessage('This private link has expired. Create a fresh link when you are ready.');
      setStatus('error');
      return;
    }
    setStatus('working');
    setMessage('Checking your saved records…');
    try {
      const prepared = await checkRecords();
      if (!isStillSignedInAs(expectedUid)) {
        setMessage(accountChangedMessage);
        setStatus('error');
        return;
      }
      if (!prepared.safe) {
        setMessage(explainPreparationFailure(prepared));
        setStatus('error');
        return;
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setMessage(localBlock);
        setStatus('error');
        return;
      }
      if (!isStillSignedInAs(expectedUid)) {
        setMessage(accountChangedMessage);
        setStatus('error');
        return;
      }
      if (isAnonymous) {
        if (!transferUrl) {
          setMessage('Prepare a private guest link first.');
          setStatus('error');
          return;
        }
        navigate(transferUrl);
        return;
      }
      navigate(config.destinationOrigin);
    } catch {
      setStatus('error');
      setMessage('We could not confirm your latest records are saved. They are still on this app. Try again.');
    }
  };

  const title = 'Milk Tracker';
  const isWorking = status === 'working' || authLoading;
  const showExpiredDate = Boolean(retirementDate && isSource && !isWorking && !localSessionBlock);
  const stageHeading = (() => {
    if (isSource) {
      if (localSessionBlock) return 'Save this session first.';
      if (transfer) return 'Your private link is ready.';
      if (status === 'error') return 'Let’s try again.';
      return 'We’re moving to a new home.';
    }
    if (!isDestination) return 'Continue with Milk Tracker.';
    if (status === 'working') {
      if (message.startsWith('Opening your guest records')) return 'Opening your guest records.';
      if (message.startsWith('Opening the guest records')) return 'Opening your guest records.';
      if (message.startsWith('Checking your saved changes')) return 'Checking before switching accounts.';
      return 'Checking your records.';
    }
    if (status === 'complete') return 'Your records are ready.';
    if (status === 'error') return 'Let’s try again.';
    if (incomingCode && localSessionBlock) return 'Save this session first.';
    if (incomingCode && user) return 'Choose an account for these records.';
    if (incomingCode) return 'Open your guest records.';
    if (user?.isAnonymous && hasGuestMigration) return 'Check your guest records.';
    if (user?.isAnonymous) return 'Open your guest records.';
    if (user) return 'Your records are on this account.';
    return 'Continue with Milk Tracker.';
  })();

  return (
    <BasePage showBackButton pageTitle={title} className="bg-linear-to-br from-background to-secondary/20">
      <main className="w-full max-w-md pb-8">
        <Card className="border-purple-200 bg-[#fcfbfc]">
          <CardHeader className="gap-2">
            <h2 id="migration-stage-heading" ref={stateHeadingRef} tabIndex={-1} className="text-xl font-semibold leading-snug text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-700 focus:ring-offset-2">
              {stageHeading}
            </h2>
            {!isWorking && isSource && user && !localSessionBlock && (
              <CardDescription className="text-sm leading-relaxed text-purple-900">
                {isAnonymous
                  ? 'Move your guest records without a Google account.'
                  : 'Use the same Google account on the new site to see your records.'}
              </CardDescription>
            )}
            {!isWorking && isDestination && incomingCode && status !== 'complete' && !localSessionBlock && (
              <CardDescription className="text-sm leading-relaxed text-purple-900">
                Your guest records will open here after they’re checked.
              </CardDescription>
            )}
            {!isWorking && isDestination && !incomingCode && status !== 'complete' && user && !isAnonymous && (
              <CardDescription className="text-sm leading-relaxed text-purple-900">
                You’re signed in. Open your tracker to check your records.
              </CardDescription>
            )}
            {!isWorking && isDestination && !incomingCode && status !== 'complete' && status !== 'error' && !user && !authLoading && (
              <CardDescription className="text-sm leading-relaxed text-purple-900">
                Sign in with the same Google account you used before.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed text-purple-950">
            {isWorking && (
              <div role="status" aria-live="polite" aria-atomic="true" className="rounded-lg bg-purple-100 px-4 py-4 text-base font-medium text-purple-950">
                {message || 'Checking your account…'}
              </div>
            )}

            {!isWorking && isSource && (
              <>
                {showExpiredDate && (
                  <p className="text-sm text-purple-800">The old address expires {retirementDate}.</p>
                )}
                {localSessionBlock && (
                  <p role="alert" className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    {localSessionBlock}
                  </p>
                )}
                {message && !localSessionBlock && status !== 'complete' && !(transfer && status !== 'error') && (
                  <p role={status === 'error' ? 'alert' : 'status'} aria-live={status === 'error' ? 'assertive' : 'polite'} className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    {message}
                  </p>
                )}

                {transfer && transferUrl && !localSessionBlock ? (
                  <section aria-labelledby="migration-stage-heading" className="space-y-3">
                    <p>Open the new app to continue. Your records will be checked there before they’re ready to view.</p>
                    <Button
                      onClick={handleOpenDestination}
                      className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900"
                    >
                      Open the new app
                    </Button>
                    <details className="rounded-lg bg-purple-50 px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                        More details
                      </summary>
                      <div className="space-y-3 pb-2">
                        <p>{describeExpiry(transfer.expiresAt) || 'This private link expires soon.'} Keep it private. Creating it does not remove your original records.</p>
                        <Button
                          onClick={handleCopyAddress}
                          variant="outline"
                          className="min-h-11 w-full border-purple-300 text-purple-900"
                        >
                          {copied ? 'Private link copied' : 'Copy private link'}
                        </Button>
                      </div>
                    </details>
                  </section>
                ) : canMove && user && localSessionBlock ? (
                  <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900 motion-reduce:transition-none">
                    <Link to="/tracker">Return to my session</Link>
                  </Button>
                ) : canMove && user ? (
                  <section className="space-y-3">
                    {isAnonymous && status !== 'error' && (
                      <p>Your guest records stay on this app until you open and verify them on the new site.</p>
                    )}
                    <Button
                      onClick={isAnonymous ? handlePrepareMove : handleOpenDestination}
                      className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900"
                    >
                      {status === 'error' ? 'Try again' : isAnonymous ? 'Move my records' : 'Open the new app'}
                    </Button>
                    {status !== 'error' && (
                      <details className="rounded-lg bg-purple-50 px-4 py-3">
                        <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                          More details
                        </summary>
                        <div className="space-y-3 pb-2">
                          <p>We’ll check that your latest records are saved before continuing.</p>
                          {!isAnonymous && (
                            <Button
                              onClick={handleCopyAddress}
                              variant="outline"
                              className="min-h-11 w-full border-purple-300 text-purple-900"
                            >
                              {copied ? 'Address copied' : 'Copy new address'}
                            </Button>
                          )}
                        </div>
                      </details>
                    )}
                  </section>
                ) : canMove && !user && !authLoading ? (
                  <section className="space-y-3">
                    <p>Open this guide from the account you use on the old app.</p>
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <Link to="/">Return to Milk Tracker</Link>
                    </Button>
                  </section>
                ) : !canMove ? (
                  <section className="space-y-3">
                    <p>The new site is still being prepared. You can keep using your records here.</p>
                    <Button asChild variant="outline" className="min-h-12 w-full border-purple-300 text-purple-900">
                      <Link to="/tracker">Return to my records</Link>
                    </Button>
                    <details className="rounded-lg bg-purple-50 px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                        More details
                      </summary>
                      <p className="pb-2">You can come back to this guide when the move is ready.</p>
                    </details>
                  </section>
                ) : null}
              </>
            )}

            {!isWorking && isDestination && status === 'complete' && result && (
              <section role="status" aria-live="polite" className="space-y-3">
                <p>Your guest records have been checked and are ready on this app.</p>
                <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                  <Link to="/tracker">View my records</Link>
                </Button>
                <details className="rounded-lg bg-purple-50 px-4 py-3">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                    More details
                  </summary>
                  <div className="space-y-2 pb-2">
                    <p>{getHomeScreenGuidance()}</p>
                    <p>You can remove the old home-screen app after you’ve checked your records.</p>
                  </div>
                </details>
              </section>
            )}

            {!isWorking && isDestination && incomingCode && status !== 'complete' && (
              <>
                {message && !localSessionBlock && status !== 'identity-conflict' && (
                  <p role={status === 'error' ? 'alert' : 'status'} aria-live={status === 'error' ? 'assertive' : 'polite'} className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    {message}
                  </p>
                )}
                {localSessionBlock && (
                  <p role="alert" className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    {localSessionBlock}
                  </p>
                )}
                {localSessionBlock ? (
                  <section className="space-y-3">
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900 motion-reduce:transition-none">
                      <Link to="/tracker">Return to my session</Link>
                    </Button>
                    <details className="rounded-lg bg-purple-50 px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                        Need help?
                      </summary>
                      <p className="pb-2">After saving your session, return to the old app and create a fresh link.</p>
                      <Button asChild variant="outline" className="min-h-11 w-full border-purple-300 text-purple-900 motion-reduce:transition-none">
                        <a href={(config.oldOrigins[0] || '') + '/migration'}>Return to the old app</a>
                      </Button>
                    </details>
                  </section>
                ) : user ? (
                  <section aria-labelledby="account-switch-heading" className="space-y-3">
                    <h3 id="account-switch-heading" tabIndex={-1} className="text-base font-semibold text-purple-950 focus:outline-none focus:ring-2 focus:ring-purple-700 focus:ring-offset-2">
                      Another account is signed in.
                    </h3>
                    {status === 'identity-conflict' && message ? (
                      <p>{message}</p>
                    ) : (
                      <p>The other account’s records stay with that account. You can switch here to open the guest records.</p>
                    )}
                    <Button
                      onClick={handleExplicitAccountSwitch}
                      className="min-h-12 h-auto w-full whitespace-normal py-3 text-center bg-purple-800 text-white hover:bg-purple-900"
                    >
                      Switch and open guest records
                    </Button>
                  </section>
                ) : (
                  <section className="space-y-3">
                    <Button
                      onClick={runGuestCompletion}
                      className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900"
                    >
                      Open my guest records
                    </Button>
                    <details className="rounded-lg bg-purple-50 px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                        More details
                      </summary>
                      <p className="pb-2">This private link opens the guest account that created it. Keep it to yourself until it expires.</p>
                    </details>
                  </section>
                )}
              </>
            )}

            {!isWorking && isDestination && !incomingCode && status !== 'complete' && (
              <>
                {message && (
                  <p role={status === 'error' ? 'alert' : 'status'} aria-live={status === 'error' ? 'assertive' : 'polite'} className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    {message}
                  </p>
                )}
                {status === 'error' && !(user?.isAnonymous && hasGuestMigration) ? (
                  <section className="space-y-3">
                    <p>Return to the old app and create a fresh private link to try again.</p>
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <a href={(config.oldOrigins[0] || '') + '/migration'}>Return to the old app</a>
                    </Button>
                  </section>
                ) : user && isAnonymous && hasGuestMigration ? (
                  <section className="space-y-3">
                    <p>Your guest account is open here. We still need to check your records.</p>
                    <Button onClick={handleResume} className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      {status === 'error' ? 'Try checking again' : 'Check my records'}
                    </Button>
                  </section>
                ) : user && isAnonymous ? (
                  <section className="space-y-3">
                    <p>To open your earlier guest records, start from the old app and create a new private link.</p>
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <a href={(config.oldOrigins[0] || '') + '/migration'}>Return to the old app</a>
                    </Button>
                  </section>
                ) : user ? (
                  <section className="space-y-3">
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <Link to="/tracker">View my records</Link>
                    </Button>
                    <details className="rounded-lg bg-purple-50 px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                        More details
                      </summary>
                      <div className="space-y-2 pb-2">
                        <p>{getHomeScreenGuidance()}</p>
                        <p>You can remove the old home-screen app after checking your records.</p>
                      </div>
                    </details>
                  </section>
                ) : !authLoading ? (
                  <section className="space-y-3">
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <Link to="/">Sign in with Google</Link>
                    </Button>
                    <details className="rounded-lg bg-purple-50 px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 font-medium text-purple-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-800">
                        Need help?
                      </summary>
                      <p className="pb-2">If you use a guest account, return to the old app and open this guide there. You don’t need Google to move guest records.</p>
                    </details>
                  </section>
                ) : null}
              </>
            )}

            {!isWorking && !isSource && !isDestination && !incomingCode && (
              <section className="space-y-3">
                {message ? (
                  <>
                    <p role="alert" aria-live="assertive" className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">{message}</p>
                    <p>Start again from the old app to prepare a new private link.</p>
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <a href={(config.oldOrigins[0] || '') + '/migration'}>Return to the old app</a>
                    </Button>
                  </>
                ) : (
                  <>
                    <p>This site is not set up for the move yet. You can continue using Milk Tracker.</p>
                    <Button asChild className="min-h-12 w-full bg-purple-800 text-white hover:bg-purple-900">
                      <Link to="/tracker">Return to my records</Link>
                    </Button>
                  </>
                )}
              </section>
            )}

          </CardContent>
        </Card>
      </main>
    </BasePage>
  );
}
