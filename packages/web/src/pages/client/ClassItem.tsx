import type { ReactNode } from "react";

export interface ClassItemProps {
  /** Horário em destaque na coluna da esquerda (ex.: "07h00"). */
  time: string;
  /** Linha pequena sob o horário (duração ou dia). */
  timeNote: string;
  /** Nome da modalidade/aula. */
  title: string;
  /** Professor, já com o prefixo ("Prof. Ana"). */
  instructor?: string;
  /** Selos da direita (vagas, situação). O significado vai no texto, não só na cor. */
  end: ReactNode;
  /** Aula em que o cliente já está reservado. */
  booked?: boolean;
  /** Com `onClick` o item é um botão (abre o detalhe); sem ele, é só leitura. */
  onClick?: () => void;
}

/** Item de aula da agenda e do histórico (D-038, `.class-item` da proposta): horário, aula e professor, selos. */
export function ClassItem({ time, timeNote, title, instructor, end, booked, onClick }: ClassItemProps) {
  const className = `fb-class-item${booked ? " fb-class-item--booked" : ""}`;
  const body = (
    <>
      <span className="fb-class-item__time">
        {time}
        {/* O espaço mantém o nome acessível legível ("07h00 60 min"); no layout a nota vai para a linha de baixo. */}{" "}
        <small>{timeNote}</small>
      </span>
      <span className="fb-class-item__meta">
        <b>{title}</b>
        {instructor && <span>{instructor}</span>}
      </span>
      <span className="fb-class-item__end">{end}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={`${className} fb-class-item--link`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
