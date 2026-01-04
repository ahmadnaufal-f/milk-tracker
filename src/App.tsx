import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import TrackerPage from './pages/TrackerPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from '@/pages/ProtectedRoute';

function App() {
    return (
        <>
            <Routes>
                <Route path="/" element={<LoginPage />} />
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
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <SettingsPage />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </>
    );
}

export default App;
