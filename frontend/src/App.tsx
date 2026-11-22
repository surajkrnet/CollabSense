import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { DashboardApp } from './pages/DashboardApp';
import { AuthGuard } from './components/AuthGuard';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<LoginPage />} />
        <Route
          path="/projects"
          element={
            <AuthGuard>
              {(user) => <ProjectsPage user={user} />}
            </AuthGuard>
          }
        />
        <Route
          path="/app/:projectId/:view?"
          element={
            <AuthGuard>
              {(user) => <DashboardApp user={user} />}
            </AuthGuard>
          }
        />
        <Route
          path="/app"
          element={
            <AuthGuard>
              {(user) => <DashboardApp user={user} />}
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
