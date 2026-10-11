import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addSession, updateLastActive } = vi.hoisted(() => ({
  addSession: vi.fn(),
  updateLastActive: vi.fn(),
}));

vi.mock('@/firebase', () => ({ auth: { currentUser: { uid: 'guest-1', isAnonymous: false } } }));
vi.mock('@/services/storage', () => ({ addSession, updateLastActive }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isGuest: true }) }));

import usePumpingControl, { PumpingProvider } from './usePumpingControl';

function PumpingProbe() {
  const control = usePumpingControl();
  return (
    <div>
      <span>{`busy:${control.isBusy}`}</span>
      <button onClick={control.handleStart}>Start</button>
      <button onClick={control.handleStop}>Stop</button>
      <button onClick={() => void control.handleSave()}>Save</button>
    </div>
  );
}

describe('PumpingProvider guest lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    updateLastActive.mockResolvedValue(undefined);
  });

  it('refreshes lastActive when a migrated custom-token guest saves a session', async () => {
    addSession.mockResolvedValue('session-1');
    render(<PumpingProvider><PumpingProbe /></PumpingProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateLastActive).toHaveBeenCalledWith('guest-1'));
    expect(addSession).toHaveBeenCalledWith('guest-1', expect.objectContaining({
      volume: 100,
      duration: 1,
    }));
    expect(localStorage.getItem('unsavedSession')).toBeNull();
  });

  it('exposes the save operation as busy while a session write is pending', async () => {
    let finishWrite: (() => void) | undefined;
    addSession.mockReturnValue(new Promise((resolve) => {
      finishWrite = () => resolve('session-1');
    }));
    render(<PumpingProvider><PumpingProbe /></PumpingProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('busy:true')).toBeTruthy());

    await act(async () => finishWrite?.());
    await waitFor(() => expect(screen.getByText('busy:false')).toBeTruthy());
  });
});
