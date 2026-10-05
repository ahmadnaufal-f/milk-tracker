import { Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { PumpingProvider } from '@/hooks/usePumpingControl';
import { useAuth } from '@/contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import TrackerPage from './pages/TrackerPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import AISummarizationContextPage from './pages/AISummarizationContextPage';
import ProtectedRoute from '@/pages/ProtectedRoute';
import PumpingControl from '@/components/PumpingControl';
import AISummaryPage from './pages/AISummaryPage';
import AppBanner from '@/components/Banner';
import PrivacyNoticePage from './pages/PrivacyNoticePage';
import DomainMigrationPage from './pages/DomainMigrationPage';
import PwaUpdateNotice from '@/components/PwaUpdateNotice';

function MainLayout() {
  return (
    <>
      <Outlet />
      <PumpingControl />
    </>
  );
}

function MigrationLayout() {
  const { user } = useAuth();
  return (
    <>
      <DomainMigrationPage />
      {user && <PumpingControl />}
    </>
  );
}

function App() {
  return (
    <PumpingProvider>
      <PwaUpdateNotice />
      <AppBanner />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/privacy" element={<PrivacyNoticePage />} />
        <Route path="/migration" element={<MigrationLayout />} />
        <Route element={<MainLayout />}>
          <Route
            path="/tracker"
            element={
              <ProtectedRoute>
                <TrackerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-summary"
            element={
              <ProtectedRoute>
                <AISummaryPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/ai-context"
          element={
            <ProtectedRoute>
              <AISummarizationContextPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </PumpingProvider>
  );
}

export default App;
