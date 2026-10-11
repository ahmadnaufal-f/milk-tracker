import { StrictMode } from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string } },
  authState: {
    user: null as null | { uid: string; isAnonymous?: boolean },
    isAnonymous: false,
    loading: false,
    hasGuestMigration: false,
  },
  pumping: { isPumping: false, isBusy: false, showSaveDialog: false },
  config: {
    campaignId: 'campaign-1',
    enabled: true,
    destinationReady: true,
    oldOrigins: ['https://old.example'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  },
  source: false,
  canMove: true,
  takeCode: vi.fn(),
  prepare: vi.fn(),
  createTransfer: vi.fn(),
  complete: vi.fn(),
  resume: vi.fn(),
  signOut: vi.fn(),
  navigate: vi.fn(),
  writeClipboard: vi.fn(),
  standalone: false,
}));

vi.mock('@/firebase', () => ({ auth: mocks.auth }));
vi.mock('firebase/auth', () => ({ signOut: mocks.signOut }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.authState }));
vi.mock('@/hooks/usePumpingControl', () => ({ default: () => mocks.pumping }));
vi.mock('@/components/BasePage', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/services/storage', () => ({ prepareForDomainMigration: mocks.prepare }));
vi.mock('@/services/guestMigration', () => ({
  completeGuestMigration: mocks.complete,
  createGuestTransfer: mocks.createTransfer,
  resumeGuestMigration: mocks.resume,
  takeGuestTransferCodeFromFragment: mocks.takeCode,
}));
vi.mock('@/lib/pwa', () => ({ isStandalonePwa: () => mocks.standalone }));
vi.mock('@/config/domainMigration', () => ({
  formatMigrationRetirementDate: (date: string | null) => date ? 'November 10, 2026' : null,
  getDomainMigrationConfig: () => mocks.config,
  isMigrationDestinationAvailable: () => mocks.canMove,
  isOldMigrationOrigin: () => mocks.source,
}));

import DomainMigrationPage from './DomainMigrationPage';

const successfulResult = {
  transferId: 'transfer-1',
  sourceUid: 'guest-1',
  sessions: [],
  settings: {},
};

function makeUser(uid: string, isAnonymous = false): User {
  return { uid, isAnonymous } as User;
}

function configureSource(options: { enabled?: boolean; ready?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const ready = options.ready ?? true;
  mocks.source = enabled;
  mocks.canMove = enabled && ready;
  mocks.config = {
    campaignId: 'campaign-1',
    enabled,
    destinationReady: ready,
    oldOrigins: ['https://old.example'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  };
}

function configureDestination() {
  mocks.source = false;
  mocks.canMove = false;
  mocks.config = {
    campaignId: 'campaign-1',
    enabled: true,
    destinationReady: true,
    oldOrigins: ['https://old.example'],
    destinationOrigin: window.location.origin,
    retirementDate: '2026-11-10',
  };
}

function renderPage() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/migration']}>
        <DomainMigrationPage navigate={mocks.navigate} />
      </MemoryRouter>
    </StrictMode>,
  );
}

let previousClipboard: PropertyDescriptor | undefined;
let previousUserAgent: PropertyDescriptor | undefined;

beforeEach(() => {
  mocks.auth.currentUser = null;
  mocks.authState = { user: null, isAnonymous: false, loading: false, hasGuestMigration: false };
  mocks.pumping = { isPumping: false, isBusy: false, showSaveDialog: false };
  mocks.config = {
    campaignId: 'campaign-1',
    enabled: true,
    destinationReady: true,
    oldOrigins: ['https://old.example'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  };
  mocks.source = false;
  mocks.canMove = true;
  mocks.takeCode.mockReturnValue(null);
  mocks.prepare.mockResolvedValue({ safe: true });
  mocks.createTransfer.mockResolvedValue({
    transferId: 'transfer-1',
    code: 'fixture-transfer-code',
    expiresAt: Date.now() + 10 * 60 * 1000,
    destinationOrigin: 'https://pump.arkaes.dev',
    sourceUid: 'guest-1',
  });
  mocks.complete.mockImplementation(async () => {
    mocks.auth.currentUser = { uid: 'guest-1' };
    return successfulResult;
  });
  mocks.resume.mockImplementation(async () => successfulResult);
  mocks.signOut.mockImplementation(async () => {
    mocks.auth.currentUser = null;
  });
  mocks.navigate.mockReset();
  mocks.writeClipboard.mockReset().mockResolvedValue(undefined);
  mocks.standalone = false;
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.writeClipboard },
  });
  previousUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  localStorage.clear();
  window.history.replaceState(null, '', '/migration');
});

afterEach(() => {
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  if (previousUserAgent) Object.defineProperty(navigator, 'userAgent', previousUserAgent);
  else delete (navigator as { userAgent?: unknown }).userAgent;
  vi.clearAllMocks();
});

describe('DomainMigrationPage', () => {
  it('offers a calm guest action and keeps the deadline secondary', () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    renderPage();

    expect(screen.getByRole('heading', { name: 'We’re moving to a new home.' })).toBeInTheDocument();
    expect(screen.getByText('Move your guest records without a Google account.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move my records' })).toBeEnabled();
    expect(screen.getByText('The old address expires November 10, 2026.')).toBeInTheDocument();
    expect(screen.queryByText(/pump\.arkaes\.dev/)).not.toBeInTheDocument();
    expect(screen.queryByText(/home screen/i)).not.toBeInTheDocument();
  });

  it('uses the same Google account on the new site and opens it after save checks', async () => {
    configureSource();
    const googleUser = makeUser('google-1');
    mocks.auth.currentUser = googleUser;
    mocks.authState = { user: googleUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    renderPage();

    expect(screen.getByText('Use the same Google account on the new site to see your records.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the new app' }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith('https://pump.arkaes.dev');
    expect(mocks.prepare).toHaveBeenCalledWith('google-1', expect.objectContaining({ isPumping: false }));
    expect(mocks.createTransfer).not.toHaveBeenCalled();
  });

  it.each([
    ['destination not ready', { enabled: true, ready: false }],
    ['migration disabled', { enabled: false, ready: true }],
  ])('keeps move actions unavailable when %s', (_description, options) => {
    configureSource(options);
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    renderPage();

    if (options.enabled === false) {
      expect(screen.getByText('This site is not set up for the move yet. You can continue using Milk Tracker.')).toBeInTheDocument();
      expect(screen.queryByText('The new site is still being prepared. You can keep using your records here.')).not.toBeInTheDocument();
    } else {
      expect(screen.getByText('The new site is still being prepared. You can keep using your records here.')).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Return to my records' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move my records' })).not.toBeInTheDocument();
    expect(mocks.createTransfer).not.toHaveBeenCalled();
  });

  it('shows only a progress announcement while preparing a guest transfer', async () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    let finishPreparation: ((value: { safe: boolean }) => void) | undefined;
    mocks.prepare.mockReturnValue(new Promise((resolve) => {
      finishPreparation = resolve;
    }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move my records' }));
    expect(screen.getByRole('status')).toHaveTextContent('Checking your saved records');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('The old address expires November 10, 2026.')).not.toBeInTheDocument();

    finishPreparation?.({ safe: true });
    expect(await screen.findByText('Your private link is ready.')).toBeInTheDocument();
    expect(mocks.createTransfer).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      destinationOrigin: 'https://pump.arkaes.dev',
    });
    expect(screen.getAllByText('Your private link is ready.')).toHaveLength(1);
  });

  it('does not create a guest link if the signed-in account changes during preparation', async () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    let finishPreparation: ((value: { safe: boolean }) => void) | undefined;
    mocks.prepare.mockReturnValue(new Promise((resolve) => {
      finishPreparation = resolve;
    }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move my records' }));
    mocks.auth.currentUser = { uid: 'another-account' };
    finishPreparation?.({ safe: true });

    expect(await screen.findByRole('alert')).toHaveTextContent('Your signed-in account changed.');
    expect(mocks.createTransfer).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('lets a guest open the new app, with link copying tucked behind More details', async () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move my records' }));
    expect(await screen.findByText('Your private link is ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the new app' })).toBeVisible();
    const details = screen.getByText('More details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.queryByText(/pump\.arkaes\.dev/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('More details'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy private link' }));
    expect(await screen.findByRole('button', { name: 'Private link copied' })).toBeInTheDocument();
    expect(mocks.writeClipboard).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open the new app' }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.prepare).toHaveBeenCalledTimes(3);
    expect(mocks.navigate.mock.calls[0][0]).toContain('/migration#');
  });

  it('blocks a move during an unfinished session and tells the user what to save', () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    mocks.pumping = { isPumping: true, isBusy: false, showSaveDialog: false };
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('Finish your current pumping session and save it before moving.');
    expect(screen.getByRole('link', { name: 'Return to my session' })).toHaveAttribute('href', '/tracker');
    expect(screen.queryByRole('button', { name: 'Move my records' })).not.toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.createTransfer).not.toHaveBeenCalled();
  });

  it('offers a retry when saving or synchronization blocks preparation', async () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    mocks.prepare
      .mockResolvedValueOnce({ safe: false, reason: 'saving' })
      .mockResolvedValueOnce({ safe: false, reason: 'sync-failed' })
      .mockResolvedValueOnce({ safe: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move my records' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your latest session is still saving.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not check your latest records. Check your connection, then try again.');
    expect(mocks.createTransfer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your private link is ready.')).toBeInTheDocument();
    expect(mocks.createTransfer).toHaveBeenCalledTimes(1);
  });

  it('does not start a guest transfer while unsaved work is stored on the device', () => {
    configureSource();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: false };
    localStorage.setItem('unsavedSession', 'draft');
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent('There is a session waiting to be saved on this device.');
    expect(screen.getByRole('link', { name: 'Return to my session' })).toHaveAttribute('href', '/tracker');
    expect(screen.queryByRole('button', { name: 'Move my records' })).not.toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('waits for the user before opening guest records, then offers records after success', async () => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    renderPage();

    expect(await screen.findByRole('button', { name: 'Open my guest records' })).toBeInTheDocument();
    expect(screen.queryByText('Your records are ready.')).not.toBeInTheDocument();
    expect(mocks.complete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open my guest records' }));
    expect(await screen.findByText('Your records are ready.')).toBeInTheDocument();
    expect(mocks.takeCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'View my records' })).toHaveAttribute('href', '/tracker');
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith('fixture-transfer-code');
    const details = screen.getByText('More details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent(/On Android/);
  });

  it('uses a guest-specific heading while opening records', async () => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    mocks.complete.mockReturnValue(new Promise(() => {}));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open my guest records' }));

    expect(screen.getByRole('heading', { name: 'Opening your guest records.' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Opening your guest records');
  });

  it.each([
    ['guest user', false],
    ['signed-in account', true],
  ])('offers a way to save an unfinished session before opening a transfer for a %s', async (_label, signedIn) => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    mocks.pumping = { isPumping: true, isBusy: false, showSaveDialog: false };
    if (signedIn) {
      const existingUser = makeUser('existing-account');
      mocks.auth.currentUser = existingUser;
      mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    }
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Save this session first.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Finish your current pumping session and save it before moving.');
    expect(screen.getByRole('link', { name: 'Return to my session' })).toHaveAttribute('href', '/tracker');
    expect(screen.queryByRole('button', { name: 'Open my guest records' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch and open guest records' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to the old app' })).toHaveAttribute(
      'href',
      'https://old.example/migration',
    );
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('shows iPhone installation help only after a verified guest transfer', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open my guest records' }));
    expect(await screen.findByRole('link', { name: 'View my records' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('More details'));
    expect(screen.getByText(/open this page in Safari/)).toBeInTheDocument();
  });

  it('keeps installation help out of view when the app is already installed', async () => {
    mocks.standalone = true;
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open my guest records' }));
    expect(await screen.findByRole('link', { name: 'View my records' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('More details'));
    expect(screen.getByText('You’re already using the installed Milk Tracker app.')).toBeInTheDocument();
  });

  it('does not replace an existing destination account without a clear switch choice', async () => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    renderPage();

    const switchButton = await screen.findByRole('button', { name: 'Switch and open guest records' });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();

    mocks.prepare.mockResolvedValue({ safe: false, reason: 'unsaved-session' });
    fireEvent.click(switchButton);
    expect(await screen.findByText(/There is a session waiting to be saved on this device/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Another account is signed in.' })).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('does not sign out if the current account changes during the switch check', async () => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    let finishPreparation: ((value: { safe: boolean }) => void) | undefined;
    mocks.prepare.mockReturnValue(new Promise((resolve) => {
      finishPreparation = resolve;
    }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Switch and open guest records' }));
    mocks.auth.currentUser = { uid: 'different-account' };
    finishPreparation?.({ safe: true });

    expect(await screen.findByText('Your signed-in account changed. Return to the account you want to move and try again.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Another account is signed in.' })).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('only switches an account after save checks pass and then verifies the guest records', async () => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Switch and open guest records' }));
    expect(await screen.findByText('Your records are ready.')).toBeInTheDocument();
    expect(mocks.prepare).toHaveBeenCalledWith('existing-account', expect.objectContaining({ isPumping: false }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });

  it('offers recovery instead of success when server verification fails', async () => {
    configureDestination();
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    mocks.complete.mockRejectedValue(new Error('verification failed'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open my guest records' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not verify this transfer yet.');
    expect(screen.queryByText('Your records are ready.')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign in with the same Google account you used before.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to the old app' })).toHaveAttribute(
      'href',
      'https://old.example/migration',
    );
  });

  it('lets a signed-in guest retry the server check after a failed confirmation', async () => {
    configureDestination();
    const guest = makeUser('guest-1', true);
    mocks.auth.currentUser = guest;
    mocks.authState = { user: guest, isAnonymous: true, loading: false, hasGuestMigration: true };
    mocks.takeCode.mockReturnValue(null);
    mocks.resume.mockRejectedValueOnce(new Error('check failed')).mockResolvedValueOnce(successfulResult);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Check my records' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not check your records just now.');
    fireEvent.click(screen.getByRole('button', { name: 'Try checking again' }));
    expect(await screen.findByText('Your records are ready.')).toBeInTheDocument();
    expect(mocks.resume).toHaveBeenCalledTimes(2);
  });

  it('shows a short account check while destination authentication is loading', () => {
    configureDestination();
    mocks.authState = { user: null, isAnonymous: false, loading: true, hasGuestMigration: false };
    mocks.takeCode.mockReturnValue(null);
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Checking your account');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not redeem a guest link when it arrives on an unconfigured origin', async () => {
    mocks.config.destinationOrigin = 'https://pump.arkaes.dev';
    mocks.takeCode.mockReturnValue('fixture-transfer-code');
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    renderPage();

    expect(await screen.findByText(/Open this private link on the new Milk Tracker site/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch accounts/i })).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
