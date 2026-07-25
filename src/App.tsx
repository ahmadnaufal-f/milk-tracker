import { Routes, Route, Outlet } from 'react-router-dom';
import { PumpingProvider } from '@/hooks/usePumpingControl';
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

function MainLayout() {
  return (
    <>
      <AppBanner />
      <Outlet />
      <PumpingControl />
    </>
  );
}

function App() {
  return (
    <PumpingProvider>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyNoticePage />} />
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
