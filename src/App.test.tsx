import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/usePumpingControl', () => ({
  PumpingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAnonymous: false, loading: false, hasGuestMigration: false }),
}));
vi.mock('@/components/PumpingControl', () => ({ default: () => null }));
vi.mock('@/components/PwaUpdateNotice', () => ({ default: () => null }));
vi.mock('@/components/Banner', () => ({ default: () => null }));
vi.mock('./pages/LoginPage', () => ({ default: () => <div>login-page</div> }));
vi.mock('./pages/TrackerPage', () => ({ default: () => <div>tracker-page</div> }));
vi.mock('./pages/HistoryPage', () => ({ default: () => <div>history-page</div> }));
vi.mock('./pages/SettingsPage', () => ({ default: () => <div>settings-page</div> }));
vi.mock('./pages/AISummarizationContextPage', () => ({ default: () => <div>ai-context-page</div> }));
vi.mock('@/pages/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./pages/AISummaryPage', () => ({ default: () => <div>ai-summary-page</div> }));
vi.mock('./pages/PrivacyNoticePage', () => ({ default: () => <div>privacy-page</div> }));
vi.mock('./pages/DomainMigrationPage', () => ({ default: () => <div>migration-page</div> }));

import App from './App';

describe('App routes', () => {
  it('redirects installed launches from /index.html to the login route', () => {
    render(
      <MemoryRouter initialEntries={['/index.html']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('login-page')).toBeInTheDocument();
  });
});
