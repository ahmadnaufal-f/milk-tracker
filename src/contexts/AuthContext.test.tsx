import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authListener, profileListener, profileError, getIdTokenResult, refreshGuestActivity } = vi.hoisted(() => ({
  authListener: { current: undefined as ((user: any) => void) | undefined },
  profileListener: { current: undefined as ((snapshot: any) => void) | undefined },
  profileError: { current: undefined as ((error: unknown) => void) | undefined },
  getIdTokenResult: vi.fn(),
  refreshGuestActivity: vi.fn(),
}));

vi.mock('@/firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn((_auth, listener) => {
    authListener.current = listener;
    return vi.fn();
  }),
  getIdTokenResult,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_reference, _options, listener, error) => {
    profileListener.current = listener;
    profileError.current = error;
    return vi.fn();
  }),
}));
vi.mock('@/services/storage', () => ({ refreshGuestActivity }));

import { AuthProvider, useAuth } from './AuthContext';

function AuthProbe() {
  const { user, isGuest, isAnonymous, hasGuestMigration, loading } = useAuth();
  return <div>{`${user?.uid ?? 'none'}:${isGuest}:${isAnonymous}:${loading}:${hasGuestMigration}`}</div>;
}

const snapshot = (isAnonymous: boolean) => ({
  metadata: { fromCache: false },
  exists: () => true,
  get: () => isAnonymous,
});

describe('AuthContext guest lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authListener.current = undefined;
    profileListener.current = undefined;
    profileError.current = undefined;
    getIdTokenResult.mockResolvedValue({ claims: {} });
    refreshGuestActivity.mockResolvedValue({ status: 'updated' });
  });

  it('treats a custom-token guest with the verified migration claim as a guest', async () => {
    getIdTokenResult.mockResolvedValue({ claims: { guestMigration: true, migrationId: 'grant-1' } });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    const transferredGuest = { uid: 'guest-1', isAnonymous: false };

    act(() => authListener.current?.(transferredGuest));
    await waitFor(() => expect(screen.getByText('guest-1:true:true:false:true')).toBeTruthy());
    expect(refreshGuestActivity).toHaveBeenCalledWith('guest-1');
    act(() => profileListener.current?.(snapshot(true)));
    expect(screen.getByText('guest-1:true:true:false:true')).toBeTruthy();
  });

  it('changes to non-guest after Google linking is reflected by the server profile', async () => {
    getIdTokenResult.mockResolvedValue({ claims: { guestMigration: true, migrationId: 'grant-1' } });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    const transferredGuest = { uid: 'guest-1', isAnonymous: false };

    act(() => authListener.current?.(transferredGuest));
    await waitFor(() => expect(screen.getByText('guest-1:true:true:false:true')).toBeTruthy());
    act(() => profileListener.current?.(snapshot(false)));
    expect(screen.getByText('guest-1:false:false:false:true')).toBeTruthy();
  });

  it('keeps an ordinary Firebase anonymous user in the guest UI', async () => {
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    act(() => authListener.current?.({ uid: 'anon-1', isAnonymous: true }));
    await waitFor(() => expect(screen.getByText('anon-1:true:true:false:false')).toBeTruthy());
  });

  it('handles profile listener errors without an unhandled callback failure', async () => {
    getIdTokenResult.mockResolvedValue({ claims: { guestMigration: true } });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    act(() => authListener.current?.({ uid: 'guest-1', isAnonymous: false }));
    await waitFor(() => expect(screen.getByText('guest-1:true:true:false:true')).toBeTruthy());
    expect(() => act(() => profileError.current?.(new Error('offline')))).not.toThrow();
    expect(screen.getByText('guest-1:true:true:false:true')).toBeTruthy();
  });
});
