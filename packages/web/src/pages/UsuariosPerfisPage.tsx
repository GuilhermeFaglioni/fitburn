import { useState } from "react";
import { Module, PermissionAction } from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { UsersPage } from "./UsersPage";
import { ProfilesPage } from "./ProfilesPage";

type Tab = "usuarios" | "perfis";

/** Usuários e perfis de acesso (D-038, #156): título e a troca entre a equipe e os perfis, cada uma só para quem pode ver. */
export function UsuariosPerfisPage() {
  const { can } = useAuth();
  const canViewUsuarios = can(Module.USUARIOS, PermissionAction.VIEW);
  const canViewPerfis = can(Module.PERFIS_DE_ACESSO, PermissionAction.VIEW);

  const [activeTab, setActiveTab] = useState<Tab>(canViewUsuarios ? "usuarios" : "perfis");

  const options: Array<{ value: Tab; label: string }> = [];
  if (canViewUsuarios) options.push({ value: "usuarios", label: "Usuários" });
  if (canViewPerfis) options.push({ value: "perfis", label: "Perfis de acesso" });

  return (
    <div className="fb-ui-page">
      <PageHeader kicker="Acesso" title="Usuários e perfis de acesso" />

      <Segmented label="Seções" options={options} value={activeTab} onChange={setActiveTab} />

      {activeTab === "usuarios" && canViewUsuarios && <UsersPage />}
      {activeTab === "perfis" && canViewPerfis && <ProfilesPage />}
    </div>
  );
}
