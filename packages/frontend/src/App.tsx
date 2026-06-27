import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TemplatesPage from './pages/TemplatesPage';
import EditorPage from './pages/EditorPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            background: '#1B1B2F',
            color: '#fff',
            fontSize: '14px',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/editor/:projectId" element={
          <ProtectedRoute><EditorPage /></ProtectedRoute>
        } />
        <Route path="/editor" element={
          <ProtectedRoute><EditorPage /></ProtectedRoute>
        } />
        <Route path="/projects" element={
          <ProtectedRoute><DashboardPage initialSection="projects" /></ProtectedRoute>
        } />
        <Route path="/templates" element={
          <ProtectedRoute><TemplatesPage /></ProtectedRoute>
        } />
        <Route path="/brand" element={
          <ProtectedRoute><DashboardPage initialSection="brand" /></ProtectedRoute>
        } />
        <Route path="/ai" element={
          <ProtectedRoute><DashboardPage initialSection="ai" /></ProtectedRoute>
        } />
        <Route path="/teams" element={
          <ProtectedRoute><DashboardPage initialSection="teams" /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><DashboardPage initialSection="settings" /></ProtectedRoute>
        } />
        <Route path="/" element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
