import { StrictMode } from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string } },
  authState: {
    user: null as null | { uid: string },
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
  code: 'private-transfer-code',
  takeCode: vi.fn(),
  prepare: vi.fn(),
  createTransfer: vi.fn(),
  complete: vi.fn(),
  resume: vi.fn(),
  signOut: vi.fn(),
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

function makeUser(uid: string): User {
  return { uid } as User;
}

function configureSource(ready = true) {
  mocks.source = true;
  mocks.canMove = ready;
  mocks.config = {
    campaignId: 'campaign-1',
    enabled: true,
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
        <DomainMigrationPage />
      </MemoryRouter>
    </StrictMode>,
  );
}

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
  mocks.code = 'private-transfer-code';
  mocks.takeCode.mockImplementation(() => mocks.code);
  mocks.prepare.mockResolvedValue({ safe: true });
  mocks.createTransfer.mockResolvedValue({
    transferId: 'transfer-1',
    code: 'private-transfer-code',
    expiresAt: Date.now() + 10 * 60 * 1000,
    destinationOrigin: 'https://pump.arkaes.dev',
    sourceUid: 'guest-1',
  });
  mocks.complete.mockResolvedValue(successfulResult);
  mocks.resume.mockResolvedValue(successfulResult);
  mocks.signOut.mockImplementation(async () => {
    mocks.auth.currentUser = null;
  });
  localStorage.clear();
  window.history.replaceState(null, '', '/migration');
});

afterEach(() => vi.clearAllMocks());

describe('DomainMigrationPage', () => {
  it('captures a destination transfer once in StrictMode and completes only after the user chooses', async () => {
    configureDestination();
    renderPage();

    expect(await screen.findByRole('button', { name: 'Move guest records to this app' })).toBeInTheDocument();
    expect(mocks.takeCode).toHaveBeenCalledTimes(1);
    expect(mocks.complete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Move guest records to this app' }));
    expect(await screen.findByText('Your records are ready.')).toBeInTheDocument();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith('private-transfer-code');
  });

  it('requires an explicit, synced account switch before signing out or redeeming', async () => {
    configureDestination();
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    renderPage();

    expect(await screen.findByRole('button', { name: 'Sign out and move guest records' })).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();

    mocks.prepare.mockResolvedValue({ safe: false, reason: 'unsaved-session' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out and move guest records' }));

    expect(await screen.findByText('There is a session waiting to be saved on this device. Save it before moving.')).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('does not sign out or redeem when the destination has an active local pumping session', async () => {
    configureDestination();
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    mocks.pumping = { isPumping: true, isBusy: false, showSaveDialog: false };
    renderPage();

    expect(await screen.findByText('Finish your current pumping session and save it before moving.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out and move guest records' })).toBeDisabled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('resumes a confirmed guest identity after a reload without requiring the consumed link again', async () => {
    configureDestination();
    const guestUser = makeUser('guest-1');
    mocks.auth.currentUser = guestUser;
    mocks.authState = { user: guestUser, isAnonymous: true, loading: false, hasGuestMigration: true };
    mocks.takeCode.mockReturnValue(null);
    renderPage();

    const retryButton = await screen.findByRole('button', { name: 'Check my guest records again' });
    expect(screen.getAllByRole('button', { name: 'Check my guest records again' })).toHaveLength(1);
    fireEvent.click(retryButton);

    expect(await screen.findByText('Your records are ready.')).toBeInTheDocument();
    expect(mocks.resume).toHaveBeenCalledTimes(1);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('creates a guest transfer only after server-backed session checks succeed', async () => {
    configureSource(true);
    const guestUser = makeUser('guest-1');
    mocks.auth.currentUser = guestUser;
    mocks.authState = { user: guestUser, isAnonymous: true, loading: false, hasGuestMigration: false };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Move my guest data' }));

    expect(await screen.findByText('Your private link is ready')).toBeInTheDocument();
    expect(mocks.prepare).toHaveBeenCalledWith('guest-1', expect.objectContaining({ isPumping: false }));
    expect(mocks.createTransfer).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      destinationOrigin: 'https://pump.arkaes.dev',
    });
    expect(screen.getByRole('button', { name: 'Copy private link' })).toBeInTheDocument();
  });

  it('keeps the destination address visible but withholds move actions until ready', async () => {
    configureSource(false);
    const guestUser = makeUser('guest-1');
    mocks.auth.currentUser = guestUser;
    mocks.authState = { user: guestUser, isAnonymous: true, loading: false, hasGuestMigration: false };
    renderPage();

    expect(screen.getByText('https://pump.arkaes.dev')).toBeInTheDocument();
    expect(screen.getByText('We’re getting the move ready. You can keep using this app for now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move my guest data' })).not.toBeInTheDocument();
    expect(mocks.createTransfer).not.toHaveBeenCalled();
  });

  it('does not switch accounts when a code arrives on an unconfigured origin', async () => {
    mocks.config.destinationOrigin = 'https://pump.arkaes.dev';
    const existingUser = makeUser('existing-account');
    mocks.auth.currentUser = existingUser;
    mocks.authState = { user: existingUser, isAnonymous: false, loading: false, hasGuestMigration: false };
    renderPage();

    expect(await screen.findByText(/can only be opened on the new Milk Tracker address/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out and move guest records' })).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
