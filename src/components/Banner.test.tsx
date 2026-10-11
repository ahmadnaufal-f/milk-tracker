import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  user: { uid: 'guest-1' },
  authState: { user: { uid: 'guest-1' }, isAnonymous: true, loading: false },
  linkGuestAccount: vi.fn(),
  signInWithPopup: vi.fn(),
  origin: 'https://pump.a-naufal.dev',
  migrationConfig: {
    campaignId: 'test-campaign',
    enabled: true,
    destinationReady: true,
    oldOrigins: ['https://pump.a-naufal.dev'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.authState }));
vi.mock('@/firebase', () => ({ auth: {}, googleProvider: {} }));
vi.mock('firebase/auth', () => ({ signInWithPopup: mocks.signInWithPopup }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@/services/accountLinking', () => ({ linkGuestAccount: mocks.linkGuestAccount }));
vi.mock('@/config/domainMigration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/domainMigration')>();
  return {
    ...actual,
    getDomainMigrationConfig: () => mocks.migrationConfig,
    isDomainMigrationActive: () => actual.isDomainMigrationActive(mocks.origin, mocks.migrationConfig),
  };
});
vi.mock('@/components/DomainMigrationNotice', () => ({
  default: () => <div data-testid="migration-entry-point">Move notice</div>,
}));

import AppBanner, { Banner, GuestBanner } from './Banner';

beforeEach(() => {
  mocks.authState = { user: mocks.user, isAnonymous: true, loading: false };
  mocks.origin = 'https://pump.a-naufal.dev';
  mocks.linkGuestAccount.mockResolvedValue({ status: 'reauth-required' });
  mocks.signInWithPopup.mockResolvedValue({ user: mocks.user });
  localStorage.clear();
});

afterEach(() => vi.clearAllMocks());

describe('GuestBanner', () => {
  it('keeps the recovery instruction available if linking changes auth state to non-guest', async () => {
    const view = render(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Link Account' }));
    expect(await screen.findByText(/your google account is linked\. sign in again/i)).toBeInTheDocument();

    mocks.authState = { user: mocks.user, isAnonymous: false, loading: false };
    view.rerender(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1);
  });
});

describe('Banner', () => {
  it('keeps the action and dismiss controls usable and accessible', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();

    render(
      <Banner
        message="A short notice"
        actionLabel="Continue"
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('min-h-11');
  });
});

describe('AppBanner migration eligibility', () => {
  function renderAppBanner(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AppBanner />
      </MemoryRouter>,
    );
  }

  it('shows the migration entry point on the old domain, including /tracker', async () => {
    mocks.origin = 'https://pump.a-naufal.dev';
    renderAppBanner('/tracker');

    expect(await screen.findByTestId('migration-entry-point')).toBeInTheDocument();
  });

  it('does not show the migration entry point on the destination domain', async () => {
    mocks.origin = 'https://pump.arkaes.dev';
    mocks.authState = { user: { uid: 'google-1' }, isAnonymous: false, loading: false };
    renderAppBanner('/tracker');

    // Wait for the route's normal banner decision before checking migration eligibility.
    expect(await screen.findByRole('button', { name: 'Read Notice' })).toBeInTheDocument();
    expect(screen.queryByTestId('migration-entry-point')).not.toBeInTheDocument();
  });

  it('does not cover the migration guide with the old-domain notice', async () => {
    mocks.origin = 'https://pump.a-naufal.dev';
    renderAppBanner('/migration');

    await vi.waitFor(() => expect(screen.queryByTestId('migration-entry-point')).not.toBeInTheDocument());
  });
});
