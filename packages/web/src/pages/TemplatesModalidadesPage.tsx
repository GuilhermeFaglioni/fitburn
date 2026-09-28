import { useState } from "react";
import { ClassTemplatesTab } from "./catalog/ClassTemplatesTab";
import { ModalitiesTab } from "./catalog/ModalitiesTab";

type Tab = "templates" | "modalidades";

export function TemplatesModalidadesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("templates");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fb-page-eyebrow">Templates &amp; modalidades</span>
        <h1 className="fb-page-title">Templates de aula e modalidades</h1>
      </div>

      <div className="fb-tabs">
        <button
          type="button"
          className={`fb-tab-btn${activeTab === "templates" ? " active" : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Templates de aula
        </button>
        <button
          type="button"
          className={`fb-tab-btn${activeTab === "modalidades" ? " active" : ""}`}
          onClick={() => setActiveTab("modalidades")}
        >
          Modalidades
        </button>
      </div>

      {activeTab === "templates" ? <ClassTemplatesTab /> : <ModalitiesTab />}
    </div>
  );
}
