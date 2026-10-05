import { StrictMode } from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  standalone: false,
  pumping: { isPumping: false, isBusy: false, showSaveDialog: false },
  config: {
    campaignId: 'test-campaign',
    enabled: true,
    destinationReady: false,
    oldOrigins: ['https://old.example'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  },
}));

vi.mock('@/config/domainMigration', () => ({
  getDomainMigrationConfig: () => mocks.config,
  formatMigrationRetirementDate: () => 'November 10, 2026',
}));
vi.mock('@/lib/pwa', () => ({ isStandalonePwa: () => mocks.standalone }));
vi.mock('@/hooks/usePumpingControl', () => ({ default: () => mocks.pumping }));

import DomainMigrationNotice from './DomainMigrationNotice';

function renderNotice() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <DomainMigrationNotice />
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  mocks.standalone = false;
  mocks.pumping = { isPumping: false, isBusy: false, showSaveDialog: false };
  mocks.config = {
    campaignId: 'test-campaign',
    enabled: true,
    destinationReady: false,
    oldOrigins: ['https://old.example'],
    destinationOrigin: 'https://pump.arkaes.dev',
    retirementDate: '2026-11-10',
  };
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe('DomainMigrationNotice', () => {
  it('keeps a compact notice available while the destination is being prepared', () => {
    renderNotice();

    expect(screen.getByRole('complementary', { name: 'Milk Tracker move notice' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read about the move' })).toHaveAttribute('href', '/migration');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains that the address is still being prepared and updates when ready', () => {
    mocks.standalone = true;
    const view = renderNotice();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/we’re getting the move ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/open the new site and add it to your home screen/i)).not.toBeInTheDocument();

    mocks.config.destinationReady = true;
    view.rerender(
      <StrictMode>
        <MemoryRouter>
          <DomainMigrationNotice />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/open the new site and add it to your home screen again/i)).toBeInTheDocument();
  });

  it('does not interrupt an active or unsaved pumping session', () => {
    mocks.standalone = true;
    mocks.config.destinationReady = true;
    mocks.pumping = { isPumping: true, isBusy: false, showSaveDialog: false };
    const view = renderNotice();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mocks.pumping = { isPumping: false, isBusy: false, showSaveDialog: true };
    view.rerender(
      <StrictMode>
        <MemoryRouter>
          <DomainMigrationNotice />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    mocks.pumping = { isPumping: false, isBusy: false, showSaveDialog: false };
    localStorage.setItem('unsavedSession', '{"startedAt":"2026-10-05T00:00:00.000Z"}');
    view.rerender(
      <StrictMode>
        <MemoryRouter>
          <DomainMigrationNotice />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('snoozes the dialog for this campaign even when storage writes fail', () => {
    mocks.standalone = true;
    mocks.config.destinationReady = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    renderNotice();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a persisted 24-hour snooze across an unmount and remount', () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    mocks.standalone = true;
    mocks.config.destinationReady = true;
    const first = renderNotice();

    fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }));
    expect(localStorage.getItem('domainMigration:test-campaign:dialogSnoozedUntil')).toBe(
      String(now + 24 * 60 * 60 * 1000),
    );
    first.unmount();

    renderNotice();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the dialog again when the persisted snooze has expired', () => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    mocks.standalone = true;
    mocks.config.destinationReady = true;
    const first = renderNotice();

    fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }));
    clock.mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
    first.unmount();

    renderNotice();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not carry a snooze into a different campaign', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    mocks.standalone = true;
    mocks.config.destinationReady = true;
    const first = renderNotice();

    fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }));
    first.unmount();
    mocks.config.campaignId = 'next-campaign';

    renderNotice();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
