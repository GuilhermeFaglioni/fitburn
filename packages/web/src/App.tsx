import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AdminLayout } from "./components/AdminLayout";
import { ClientLayout } from "./components/ClientLayout";
import { AuthProvider } from "./lib/auth/AuthContext";
import { SessionCacheReset } from "./lib/auth/SessionCacheReset";
import { AreaRoute } from "./routes/AreaRoute";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { ClientHomePage } from "./pages/ClientHomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsuariosPerfisPage } from "./pages/UsuariosPerfisPage";
import { TemplatesModalidadesPage } from "./pages/TemplatesModalidadesPage";
import { AgendaAdminPage } from "./pages/AgendaAdminPage";
import { ClientAgendaPage } from "./pages/ClientAgendaPage";
import { MyClassesPage } from "./pages/MyClassesPage";
import { AttendancePage } from "./pages/AttendancePage";
import { GamificationPage } from "./pages/GamificationPage";
import { AssignmentsPage } from "./pages/AssignmentsPage";
import { GoalsPage } from "./pages/GoalsPage";
import { PlanPage } from "./pages/PlanPage";
import { PlansPage } from "./pages/PlansPage";
import { ProfilePage } from "./pages/ProfilePage";
import { OwnAreaLayout } from "./components/OwnAreaLayout";

export default function App() {
  return (
    <AuthProvider>
      <SessionCacheReset />
      <BrowserRouter>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  );
}

/** As rotas da aplicação, separadas do BrowserRouter para os testes usarem MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AreaRoute area="client">
              <ClientLayout />
            </AreaRoute>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<ClientHomePage />} />
        <Route path="/agenda" element={<ClientAgendaPage />} />
        <Route path="/plano" element={<PlanPage />} />
        <Route path="/gamificacao" element={<GamificationPage />} />
      </Route>
      <Route
        element={
          <ProtectedRoute>
            <AreaRoute area="admin">
              <AdminLayout />
            </AreaRoute>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/usuarios" element={<UsuariosPerfisPage />} />
        <Route path="/agenda-administrativa" element={<AgendaAdminPage />} />
        <Route path="/templates-e-modalidades" element={<TemplatesModalidadesPage />} />
        <Route path="/minhas-aulas" element={<MyClassesPage />} />
        <Route path="/atribuicoes" element={<AssignmentsPage />} />
        <Route path="/planos" element={<PlansPage />} />
        <Route path="/metas" element={<GoalsPage />} />
      </Route>
      {/* Presença é uma tela cheia (PresencaMobile.dc.html), sem a sidebar administrativa. */}
      <Route
        path="/presenca/:occurrenceId"
        element={
          <ProtectedRoute>
            <AreaRoute area="admin">
              <AttendancePage />
            </AreaRoute>
          </ProtectedRoute>
        }
      />
      {/* Perfil / Minha conta: a mesma tela para todos, na casca de cada área. */}
      <Route
        element={
          <ProtectedRoute>
            <OwnAreaLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
