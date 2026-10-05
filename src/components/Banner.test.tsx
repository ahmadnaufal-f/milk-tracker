import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  user: { uid: 'guest-1' },
  authState: { user: { uid: 'guest-1' }, isAnonymous: true },
  linkGuestAccount: vi.fn(),
  signInWithPopup: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.authState }));
vi.mock('@/firebase', () => ({ auth: {}, googleProvider: {} }));
vi.mock('firebase/auth', () => ({ signInWithPopup: mocks.signInWithPopup }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@/services/accountLinking', () => ({ linkGuestAccount: mocks.linkGuestAccount }));
vi.mock('@/config/domainMigration', () => ({ isDomainMigrationActive: () => false }));
vi.mock('@/components/DomainMigrationNotice', () => ({ default: () => null }));

import { GuestBanner } from './Banner';

beforeEach(() => {
  mocks.authState = { user: mocks.user, isAnonymous: true };
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

    mocks.authState = { user: mocks.user, isAnonymous: false };
    view.rerender(
      <MemoryRouter>
        <GuestBanner />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(mocks.signInWithPopup).toHaveBeenCalledTimes(1);
  });
});
