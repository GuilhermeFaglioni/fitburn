import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AdminLayout } from "./components/AdminLayout";
import { ClientLayout } from "./components/ClientLayout";
import { AuthProvider } from "./lib/auth/AuthContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { ClientHomePage } from "./pages/ClientHomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsuariosPerfisPage } from "./pages/UsuariosPerfisPage";
import { TemplatesModalidadesPage } from "./pages/TemplatesModalidadesPage";
import { AgendaAdminPage } from "./pages/AgendaAdminPage";
import { ClientAgendaPage } from "./pages/ClientAgendaPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <ClientLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<ClientHomePage />} />
              <Route path="/agenda" element={<ClientAgendaPage />} />
            </Route>
            <Route
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/usuarios" element={<UsuariosPerfisPage />} />
              <Route path="/agenda-administrativa" element={<AgendaAdminPage />} />
              <Route path="/templates-e-modalidades" element={<TemplatesModalidadesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  );
}
