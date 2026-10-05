import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PwaUpdateNotice from './PwaUpdateNotice';

const mocks = vi.hoisted(() => ({
  auth: { user: { uid: 'guest' } as { uid: string } | null, loading: false },
  available: true,
  prepare: vi.fn(),
  activate: vi.fn(),
  pumping: { isPumping: false, isBusy: false, showSaveDialog: false },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/services/storage', () => ({ prepareForDomainMigration: mocks.prepare }));
vi.mock('@/hooks/usePumpingControl', () => ({ default: () => mocks.pumping }));
vi.mock('@/services/pwaUpdates', () => ({
  hasAppUpdate: () => mocks.available,
  subscribeToAppUpdate: () => () => undefined,
  activateAppUpdate: mocks.activate,
}));

describe('safe PWA update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.auth = { user: { uid: 'guest' }, loading: false };
    mocks.available = true;
    mocks.pumping = { isPumping: false, isBusy: false, showSaveDialog: false };
    mocks.prepare.mockResolvedValue({ safe: true });
    mocks.activate.mockResolvedValue(undefined);
  });

  it('waits for confirmed synchronization before activating an update', async () => {
    let finishSync!: (value: { safe: true }) => void;
    mocks.prepare.mockReturnValue(new Promise((resolve) => { finishSync = resolve; }));
    render(<PwaUpdateNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Update app' }));
    expect(mocks.activate).not.toHaveBeenCalled();
    finishSync({ safe: true });
    await waitFor(() => expect(mocks.activate).toHaveBeenCalledOnce());
  });

  it.each(['pumping_startTime', 'unsavedSession'])('keeps %s and postpones the update', async (key) => {
    localStorage.setItem(key, 'saved-locally');
    render(<PwaUpdateNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Update app' }));
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe('saved-locally');
    expect(screen.getByRole('status').textContent).toContain('finish and save');
  });

  it('does not reload after a failed synchronization check', async () => {
    mocks.prepare.mockResolvedValue({ safe: false, reason: 'offline' });
    render(<PwaUpdateNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Update app' }));
    await screen.findByText(/couldn't confirm your latest changes/i);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('checks live saving state and does not activate while signed out', async () => {
    mocks.auth.user = null;
    mocks.pumping.isBusy = true;
    mocks.prepare.mockResolvedValue({ safe: false, reason: 'missing-user' });
    render(<PwaUpdateNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Update app' }));
    await screen.findByText(/Please sign in/i);
    expect(mocks.prepare).toHaveBeenCalledWith(null, { isPumping: false, isBusy: true });
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('rechecks a timer started while synchronization was running', async () => {
    mocks.prepare.mockImplementation(async () => {
      localStorage.setItem('pumping_startTime', 'new-session');
      return { safe: true };
    });
    render(<PwaUpdateNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Update app' }));
    await screen.findByText(/finish and save/i);
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(localStorage.getItem('pumping_startTime')).toBe('new-session');
  });

  it('postpones activation when saving starts during synchronization', async () => {
    let finishSync!: (value: { safe: true }) => void;
    mocks.prepare.mockReturnValue(new Promise((resolve) => { finishSync = resolve; }));
    const view = render(<PwaUpdateNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Update app' }));
    mocks.pumping.isBusy = true;
    view.rerender(<PwaUpdateNotice />);
    finishSync({ safe: true });
    await screen.findByText(/finish and save/i);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('does not display an update when none is ready', () => {
    mocks.available = false;
    render(<PwaUpdateNotice />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
