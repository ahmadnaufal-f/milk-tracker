import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  formatMigrationRetirementDate,
  getDomainMigrationConfig,
  isMigrationDestinationAvailable,
  isOldMigrationOrigin,
} from '@/config/domainMigration';

type GuestMigrationResult = Awaited<ReturnType<typeof completeGuestMigration>>;
type GuestTransfer = Awaited<ReturnType<typeof createGuestTransfer>>;
type PreparationResult = Awaited<ReturnType<typeof prepareForDomainMigration>>;

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
      return 'We could not confirm that your latest records have synced. Keep this app and try again when you have a steady connection.';
    case 'missing-user':
      return 'Open this guide from the guest account on the old app to move its records.';
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
    return 'We could not check this device for an unfinished session yet. Please try again.';
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

export default function DomainMigrationPage() {
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
      setMessage('This private link can only be opened on the new Milk Tracker address. You can return to the old app and try again there.');
    }
  }, [isDestination]);

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

  const handlePrepareMove = async () => {
    if (!user || !canMove || status === 'working') return;
    setStatus('working');
    setMessage('Checking that your latest records are ready…');
    setTransfer(null);
    setTransferUrl(null);

    try {
      const prepared = await checkRecords();
      if (!prepared.safe) {
        setMessage(explainPreparationFailure(prepared));
        setStatus('idle');
        return;
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setMessage(localBlock);
        setStatus('idle');
        return;
      }

      if (isAnonymous) {
        const created = await createGuestTransfer({
          campaignId: config.campaignId,
          destinationOrigin: config.destinationOrigin!,
        });
        const localBlockAfterIssue = checkLiveLocalState();
        if (localBlockAfterIssue) {
          setMessage(`${localBlockAfterIssue} The private link was not shown; it will expire automatically.`);
          setStatus('idle');
          return;
        }
        const privateUrl = buildGuestTransferUrl(created, config.destinationOrigin!);
        setTransfer(created);
        setTransferUrl(privateUrl);
        setMessage('Your private link is ready. Your original records remain in the guest account on this app; creating a link does not remove them.');
        setStatus('idle');
        return;
      }

      window.location.assign(config.destinationOrigin!);
    } catch {
      setMessage('We could not prepare the move just now. Your records are still in this app. Please try again.');
      setStatus('error');
    }
  };

  const runGuestCompletion = async () => {
    if (!isDestination || !incomingCode || completionStarted.current) return;
    if (auth.currentUser) {
      setMessage('This browser is signed in to another account. Choose to sign out before opening the guest records.');
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
    setMessage('Opening your guest records on this app…');
    try {
      const migrationResult = await completeGuestMigration(code);
      setResult(migrationResult);
      setStatus('complete');
      completionStarted.current = false;
      setMessage('Your records are ready on this app. You can check your history and settings now.');
    } catch (error) {
      const errorCode = getErrorCode(error);
      if (errorCode === 'guest-migration/identity-conflict') {
        setIncomingCode(code);
        completionStarted.current = false;
        setStatus('identity-conflict');
        setMessage('This browser is signed in to another account. Sign out here before opening the guest records from this link. The other account’s records remain saved with that account.');
        return;
      }
      setStatus('error');
      completionStarted.current = false;
      setMessage('We could not confirm the guest records yet. Your original records remain on the old app. If the guest account is signed in here, use the check below; otherwise return to the old app for a fresh link.');
    }
  };

  const handleExplicitAccountSwitch = async () => {
    if (!isDestination || !incomingCode || !user) return;
    setStatus('working');
    setMessage('Checking this device before switching accounts…');
    try {
      const prepared = await checkRecords();
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
      setMessage('Signing out of this browser, then opening the guest records…');
      await signOut(auth);
      await runGuestCompletion();
    } catch {
      setStatus('identity-conflict');
      setMessage('We could not switch the account on this browser. Your current account is still signed in. You can try again when ready.');
    }
  };

  const handleResume = async () => {
    if (!isDestination || !user || !hasGuestMigration || status === 'working') return;
    setStatus('working');
    setMessage('Checking your guest records on this app…');
    try {
      const migrationResult = await resumeGuestMigration();
      setResult(migrationResult);
      setStatus('complete');
      setMessage('Your records are ready on this app. You can check your history and settings now.');
    } catch {
      setStatus('error');
      setMessage('We could not confirm the records on this app yet. Your original records remain in the guest account on the old app. Try again when you have a steady connection.');
    }
  };

  const handleCopyAddress = async () => {
    if (!config.destinationOrigin) return;
    if (transfer && Date.now() >= Number(transfer.expiresAt)) {
      setTransfer(null);
      setTransferUrl(null);
      setMessage('This private link has expired. Create a fresh link when you are ready.');
      return;
    }
    try {
      if (isSource && user) {
        const prepared = await checkRecords();
        if (!prepared.safe) {
          setMessage(explainPreparationFailure(prepared));
          return;
        }
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setMessage(localBlock);
        return;
      }
      const address = transferUrl || config.destinationOrigin;
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage('We could not confirm your latest records or copy the address. Your records are still here; please try again when ready.');
    }
  };

  const handleOpenDestination = async () => {
    if (!isSource || !user || !canMove || !config.destinationOrigin || status === 'working') return;
    if (isAnonymous && transfer && Date.now() >= Number(transfer.expiresAt)) {
      setTransfer(null);
      setTransferUrl(null);
      setMessage('This private link has expired. Create a fresh link when you are ready.');
      return;
    }
    setStatus('working');
    setMessage('Checking that your latest records are ready…');
    try {
      const prepared = await checkRecords();
      if (!prepared.safe) {
        setMessage(explainPreparationFailure(prepared));
        setStatus('idle');
        return;
      }
      const localBlock = checkLiveLocalState();
      if (localBlock) {
        setMessage(localBlock);
        setStatus('idle');
        return;
      }
      if (isAnonymous) {
        if (!transferUrl) {
          setMessage('Create your private guest link first.');
          setStatus('idle');
          return;
        }
        window.location.assign(transferUrl);
        return;
      }
      window.location.assign(config.destinationOrigin);
    } catch {
      setStatus('error');
      setMessage('We could not confirm that your latest records have synced. Your records are still in this app. Please try again.');
    }
  };

  const title = isDestination ? 'Your new Milk Tracker' : 'Milk Tracker is moving';

  return (
    <BasePage showBackButton pageTitle={title} className="bg-linear-to-br from-background to-secondary/20">
      <main className="w-full max-w-xl pb-20">
        <Card className="border-purple-200 bg-[#fcfbfc]">
          <CardHeader>
            <CardTitle className="text-purple-950">
              {isDestination ? 'Continue with your records' : 'Let’s save your latest session first'}
            </CardTitle>
            <CardDescription className="text-purple-900">
              {isDestination
                ? 'This is the new Milk Tracker address. Guests can open a private link from the old app; Google users can sign in with the same account.'
                : 'Milk Tracker is moving to a new web address. You can prepare now and continue when you are ready.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm leading-relaxed text-purple-950">
            {retirementDate && !isDestination && (
              <p className="rounded-lg bg-purple-100 px-4 py-3 font-medium text-purple-950">
                Please move before {retirementDate}.
              </p>
            )}

            {incomingCode && isDestination && !authLoading && status !== 'working' && status !== 'complete' && (
              <section aria-labelledby="guest-link-heading" className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
                <h2 id="guest-link-heading" className="text-base font-semibold text-purple-950">A private guest link is ready</h2>
                <p>
                  This link opens the guest account that created it. Keep it private; anyone with the link can access those records until it expires.
                </p>
                {user ? (
                  <>
                    <p>{status === 'identity-conflict' && message ? message : 'This browser is already signed in. Moving will sign out of the current account on this device, then open the guest records. The current account’s records stay with that account.'}</p>
                    {localSessionBlock && <p role="status">{localSessionBlock}</p>}
                    <Button onClick={handleExplicitAccountSwitch} disabled={Boolean(localSessionBlock)} className="min-h-11 w-full bg-purple-800 text-white hover:bg-purple-900">
                      Sign out and move guest records
                    </Button>
                  </>
                ) : (
                  <>
                    {localSessionBlock && <p role="status">{localSessionBlock}</p>}
                    <Button onClick={runGuestCompletion} disabled={Boolean(localSessionBlock)} className="min-h-11 w-full bg-purple-800 text-white hover:bg-purple-900">
                    Move guest records to this app
                    </Button>
                  </>
                )}
              </section>
            )}

            {status === 'complete' && result && (
              <section role="status" className="space-y-2 rounded-xl bg-purple-100 p-4 text-purple-950">
                <h2 className="font-semibold">Your records are ready.</h2>
                <p>You can check your history and settings, then add this app to your home screen when you’re ready.</p>
                <Button asChild variant="outline" className="border-purple-300 bg-white text-purple-900 hover:bg-purple-50">
                  <Link to="/tracker">Open my tracker</Link>
                </Button>
              </section>
            )}

            {message && status !== 'complete' && status !== 'identity-conflict' && status !== 'working' && (
              <p role={status === 'error' ? 'alert' : 'status'} className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                {message}
              </p>
            )}

            {incomingCode && isDestination && authLoading && (
              <p role="status" className="text-purple-900">Checking the signed-in account…</p>
            )}

            {status === 'working' && (
              <p role="status" className="text-purple-900">{message || 'Preparing your records…'}</p>
            )}

            {isDestination && user && isAnonymous && hasGuestMigration && status !== 'complete' && !incomingCode && (
              <section className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
                <h2 className="text-base font-semibold text-purple-950">Finish checking guest records</h2>
                <p>The guest account is signed in, but this app has not confirmed its history and settings yet.</p>
                <Button onClick={handleResume} disabled={status === 'working'} className="min-h-11 w-full bg-purple-800 text-white hover:bg-purple-900">
                  {status === 'working' ? 'Checking your records…' : 'Check my guest records again'}
                </Button>
              </section>
            )}

            {isSource && (
              <>
                <section className="space-y-2">
                  <h2 className="text-base font-semibold text-purple-950">Before you move</h2>
                  <p>Finish and save your current session. We check that your latest records have synced before continuing.</p>
                  {user && isAnonymous ? (
                    <p>Your guest records can move without a Google account. The new app checks the records before saying they are ready.</p>
                  ) : user ? (
                    <p>On the new site, sign in with the same Google account to find your synced records and settings.</p>
                  ) : (
                    <p>If you use a guest account, open this guide from it to make a private link; you do not need Google. If you use Google, sign in on the new site with the same account.</p>
                  )}
                </section>

                {canMove && user && !incomingCode && status !== 'complete' && (
                  <div className="space-y-3">
                    {isAnonymous ? (
                    <Button onClick={handlePrepareMove} disabled={status === 'working' || isPumping || isBusy || showSaveDialog} className="min-h-11 w-full bg-purple-800 text-white hover:bg-purple-900">
                        {status === 'working' ? 'Checking your records…' : transfer ? 'Create a fresh private link' : 'Move my guest data'}
                      </Button>
                    ) : (
                    <Button onClick={handleOpenDestination} disabled={status === 'working' || isPumping || isBusy || showSaveDialog} className="min-h-11 w-full bg-purple-800 text-white hover:bg-purple-900">
                        {status === 'working' ? 'Checking your records…' : 'Open new app'}
                      </Button>
                    )}
                  </div>
                )}

                {!user && !authLoading && (
                  <p className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    Return to the old app and open this guide from the account you use there.
                  </p>
                )}

                {config.destinationOrigin && (
                  <section className="space-y-1 rounded-lg bg-purple-100 px-4 py-3">
                    <h2 className="font-semibold">New address</h2>
                    <p className="break-all">{config.destinationOrigin}</p>
                    {!canMove && <p>We’re getting the move ready. You can keep using this app for now.</p>}
                  </section>
                )}

                {!config.destinationOrigin && (
                  <p className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                    We’re getting the move ready. You can keep using this app for now.
                  </p>
                )}

                {transfer && transferUrl && (
                  <section className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
                    <h2 className="text-base font-semibold text-purple-950">Your private link is ready</h2>
                    <p>{describeExpiry(transfer.expiresAt) || 'This link is short-lived.'} Keep it private. Your original records remain in the guest account on this app; creating a link does not remove them.</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button onClick={handleOpenDestination} disabled={status === 'working' || isPumping || isBusy || showSaveDialog} className="min-h-11 flex-1 bg-purple-800 text-white hover:bg-purple-900">
                        Open new app
                      </Button>
                      <Button onClick={handleCopyAddress} disabled={status === 'working' || isPumping || isBusy || showSaveDialog} variant="outline" className="min-h-11 flex-1 border-purple-300 text-purple-900">
                        {copied ? 'Private link copied' : 'Copy private link'}
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}

            {isDestination && !incomingCode && (
              <section className="space-y-3">
                <h2 className="text-base font-semibold text-purple-950">Add this app to your home screen</h2>
                <p>Android: open this site in Chrome, then choose Install app or Add to Home screen from the browser menu.</p>
                <p>iPhone or iPad: open this site in Safari, tap Share, then choose Add to Home Screen.</p>
                <p>Reminders may need to be enabled again on this app. Remove the old home-screen app after you have checked your records and installed this one.</p>
                {!authLoading && !isAnonymous && (
                  <Button asChild className="min-h-11 w-full bg-purple-800 text-white hover:bg-purple-900">
                    <Link to={user ? '/tracker' : '/'}>{user ? 'Open my tracker' : 'Sign in on the new app'}</Link>
                  </Button>
                )}
              </section>
            )}

            {isDestination && auth.currentUser && !isAnonymous && !incomingCode && (
              <p className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                Check your history and settings after signing in with the same Google account you used before.
              </p>
            )}

            {isSource && canMove && (
              <section className="space-y-2 border-t border-purple-200 pt-4">
                <h2 className="text-base font-semibold text-purple-950">When you’re ready to install</h2>
                <p>Android: open the new site in Chrome and choose Install app or Add to Home screen from the browser menu.</p>
                <p>iPhone or iPad: open the new site in Safari, tap Share, then choose Add to Home Screen.</p>
                {isAnonymous ? (
                  <p>The private guest link includes a one-use code and expires soon. If opening it from this app window is difficult, copy the private link and open it in your browser.</p>
                ) : (
                  <p>If opening the new site from this app window is difficult, copy its address and open it in your browser. Reminders may need to be enabled again on the new app.</p>
                )}
                {!isAnonymous && (
                  <Button onClick={handleCopyAddress} variant="outline" className="border-purple-300 text-purple-900">
                    {copied ? 'Address copied' : 'Copy new address'}
                  </Button>
                )}
                <p>Check your history and settings, then remove the old home-screen app when you’re ready.</p>
              </section>
            )}

            {!isSource && !isDestination && !incomingCode && (
              <p className="rounded-lg bg-purple-100 px-4 py-3 text-purple-950">
                This site does not have a move configured yet. You can return to Milk Tracker and continue using it.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </BasePage>
  );
}
