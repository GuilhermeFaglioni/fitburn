import { AppShell } from "./components/AppShell";
import { HealthStatus } from "./pages/HealthStatus";

export default function App() {
  return (
    <AppShell>
      <h1>Fitburn</h1>
      <HealthStatus />
    </AppShell>
  );
}
