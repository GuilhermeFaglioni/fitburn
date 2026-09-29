import { PlanAssignmentStatus, type PlanAssignment } from "@fitburn/contracts";
import { formatLocalDate } from "../../lib/agenda/format";

/**
 * A lista de planos de um cliente, do mais recente ao mais antigo (nome, datas
 * e situação). Serve à tela do cliente (tema escuro, PlanoDesktop.dc.html) e à
 * consulta da administração (`light`).
 */
export function PlanHistoryList({
  items,
  light = false,
}: {
  items: PlanAssignment[];
  light?: boolean;
}) {
  return (
    <ul className={`fb-plan__history-list${light ? " fb-plan__history-list--light" : ""}`}>
      {items.map((item) => (
        <li key={item.id} className="fb-plan__history-item">
          <div className="fb-plan__history-info">
            <span className="fb-plan__history-name">{item.plan.name}</span>
            <span className="fb-plan__history-dates">
              {formatLocalDate(item.startDate)} – {formatLocalDate(item.endDate)}
            </span>
          </div>
          <span className="fb-plan__history-status">
            {item.status === PlanAssignmentStatus.ACTIVE ? "ATIVO" : "ENCERRADO"}
          </span>
        </li>
      ))}
    </ul>
  );
}
