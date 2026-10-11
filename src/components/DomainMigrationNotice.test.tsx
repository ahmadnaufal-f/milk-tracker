import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: 'guest-1' }, isGuest: true, loading: false },
  config: {
    campaignId: 'test-campaign',
    enabled: true,
    destinationReady: true,
    oldOrigins: ['https://pump.a-naufal.dev'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/config/domainMigration', () => ({
  getDomainMigrationConfig: () => mocks.config,
  formatMigrationRetirementDate: () => 'November 10, 2026',
}));

import DomainMigrationNotice from './DomainMigrationNotice';

function renderNotice() {
  return render(
    <MemoryRouter>
      <DomainMigrationNotice />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.auth = { user: { uid: 'guest-1' }, isGuest: true, loading: false };
  mocks.config.destinationReady = true;
  mocks.config.retirementDate = '2026-11-10';
});

describe('DomainMigrationNotice', () => {
  it('gives a guest one clear action and keeps the deadline secondary', () => {
    renderNotice();

    expect(screen.getByRole('complementary', { name: 'Milk Tracker move notice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'We’re moving to a new home.' })).toBeInTheDocument();
    expect(screen.getByText('Your guest records can move with you. You do not need a Google account.')).toBeInTheDocument();
    expect(screen.getByText('Please move before November 10, 2026.')).toHaveClass('text-xs');
    expect(screen.getByRole('link', { name: 'Move my records' })).toHaveAttribute('href', '/migration');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tells Google users to use the same account on the new site', () => {
    mocks.auth = { user: { uid: 'google-1' }, isGuest: false, loading: false };

    renderNotice();

    expect(screen.getByText('Use the same Google account on the new site to see your records.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See how to move' })).toHaveAttribute('href', '/migration');
  });

  it('offers move details while the destination is not ready', () => {
    mocks.config.destinationReady = false;

    renderNotice();

    expect(screen.getByText('We’re getting the move ready. Your records stay on this app for now.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See move details' })).toHaveAttribute('href', '/migration');
    expect(screen.queryByRole('link', { name: 'Move my records' })).not.toBeInTheDocument();
  });

  it('uses a neutral action while account status is still loading', () => {
    mocks.auth = { user: { uid: 'guest-1' }, isGuest: true, loading: true };

    renderNotice();

    expect(screen.getByText('You can review the move whenever you’re ready.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See move details' })).toBeInTheDocument();
  });
});
