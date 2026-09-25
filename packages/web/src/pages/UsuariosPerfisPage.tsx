import { useState } from "react";
import { Module, PermissionAction } from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import { UsersPage } from "./UsersPage";
import { ProfilesPage } from "./ProfilesPage";

type Tab = "usuarios" | "perfis";

export function UsuariosPerfisPage() {
  const { can } = useAuth();
  const canViewUsuarios = can(Module.USUARIOS, PermissionAction.VIEW);
  const canViewPerfis = can(Module.PERFIS_DE_ACESSO, PermissionAction.VIEW);

  const [activeTab, setActiveTab] = useState<Tab>(canViewUsuarios ? "usuarios" : "perfis");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fb-page-eyebrow">Usuários e perfis de acesso</span>
        <h1 className="fb-page-title">Usuários e perfis de acesso</h1>
      </div>

      <div className="fb-tabs">
        {canViewUsuarios && (
          <button
            type="button"
            className={`fb-tab-btn${activeTab === "usuarios" ? " active" : ""}`}
            onClick={() => setActiveTab("usuarios")}
          >
            Usuários
          </button>
        )}
        {canViewPerfis && (
          <button
            type="button"
            className={`fb-tab-btn${activeTab === "perfis" ? " active" : ""}`}
            onClick={() => setActiveTab("perfis")}
          >
            Perfis de acesso
          </button>
        )}
      </div>

      {activeTab === "usuarios" && canViewUsuarios && <UsersPage />}
      {activeTab === "perfis" && canViewPerfis && <ProfilesPage />}
    </div>
  );
}
