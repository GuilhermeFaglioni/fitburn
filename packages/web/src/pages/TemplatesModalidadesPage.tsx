import { useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { ClassTemplatesTab } from "./catalog/ClassTemplatesTab";
import { ModalitiesTab } from "./catalog/ModalitiesTab";

type Tab = "templates" | "modalidades";

const TABS = [
  { value: "templates", label: "Templates de aula" },
  { value: "modalidades", label: "Modalidades" },
] as const;

/** Templates de aula e modalidades (D-038, #156): título e a troca entre as duas tabelas. */
export function TemplatesModalidadesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("templates");

  return (
    <div className="fb-ui-page">
      <PageHeader kicker="Templates & modalidades" title="Templates de aula e modalidades" />

      <Segmented label="Seções" options={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === "templates" ? <ClassTemplatesTab /> : <ModalitiesTab />}
    </div>
  );
}
