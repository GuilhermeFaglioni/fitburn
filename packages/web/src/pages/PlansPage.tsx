import { useState } from "react";
import { CatalogTab } from "./plans/CatalogTab";
import { AssignTab } from "./plans/AssignTab";

type Tab = "catalogo" | "atribuir";

/** Planos (PlanosAdmin.dc.html): o catálogo e a atribuição de planos a clientes. */
export function PlansPage() {
  const [tab, setTab] = useState<Tab>("catalogo");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fb-page-eyebrow">Planos</span>
        <h1 className="fb-page-title">Planos</h1>
      </div>

      <div className="fb-tabs">
        <button
          type="button"
          className={`fb-tab-btn${tab === "catalogo" ? " active" : ""}`}
          onClick={() => setTab("catalogo")}
        >
          Catálogo de planos
        </button>
        <button
          type="button"
          className={`fb-tab-btn${tab === "atribuir" ? " active" : ""}`}
          onClick={() => setTab("atribuir")}
        >
          Atribuir a cliente
        </button>
      </div>

      {tab === "catalogo" ? <CatalogTab /> : <AssignTab />}
    </div>
  );
}
