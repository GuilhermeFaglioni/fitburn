import { useId, useState } from "react";
import type { ClientSummary } from "@fitburn/contracts";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";

interface StudentListProps {
  students: ClientSummary[];
  selectedId: string;
  /** Acesso a todos os clientes (administração): a lista não é "os meus alunos". */
  allStudents: boolean;
  onSelect: (id: string) => void;
}

/**
 * Coluna de alunos do layout lista + detalhe (Fichas de treino e Metas), com a largura `--list-w`: busca e a lista dos
 * alunos do escopo, que a API já devolve filtrada. O aluno aberto leva `aria-current`.
 */
export function StudentList({ students, selectedId, allStudents, onSelect }: StudentListProps) {
  const titleId = useId();
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLowerCase();
  const visible = students.filter(
    (student) => normalized === "" || student.fullName.toLowerCase().includes(normalized),
  );

  return (
    <Card as="aside" aria-labelledby={titleId} className="fb-ui-students">
      <h2 id={titleId} className="fb-ui-students__title">
        {allStudents ? "Todos os alunos" : "Meus alunos"}
      </h2>
      <Field
        type="search"
        label="Buscar aluno"
        hideLabel
        placeholder="Buscar aluno"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {visible.length > 0 && (
        <ul className="fb-ui-students__list" aria-labelledby={titleId}>
          {visible.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                className="fb-ui-students__item"
                aria-current={student.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(student.id)}
              >
                {student.fullName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {students.length > 0 && visible.length === 0 && (
        <p className="fb-ui-students__note" role="status">
          Nenhum aluno encontrado.
        </p>
      )}
      <p className="fb-ui-students__note">
        {allStudents
          ? "Você tem acesso a todos os clientes ativos."
          : "Lista filtrada pelos alunos vinculados ao professor logado."}
      </p>
    </Card>
  );
}
