import { useState } from "react";
import type { ClientSummary } from "@fitburn/contracts";

interface StudentListProps {
  students: ClientSummary[];
  selectedId: string;
  /** Acesso a todos os clientes (administração): a lista não é "os meus alunos". */
  allStudents: boolean;
  onSelect: (id: string) => void;
}

/** Coluna "MEUS ALUNOS" da tela de metas (MetasAdmin.dc.html): busca e a lista dos alunos do escopo. */
export function StudentList({ students, selectedId, allStudents, onSelect }: StudentListProps) {
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLowerCase();
  const visible = students.filter(
    (student) => normalized === "" || student.fullName.toLowerCase().includes(normalized),
  );

  return (
    <aside className="fb-goals__students">
      <span className="fb-goals__students-title">
        {allStudents ? "TODOS OS ALUNOS" : "MEUS ALUNOS"}
      </span>
      <input
        type="search"
        className="fb-field"
        placeholder="Buscar aluno"
        aria-label="Buscar aluno"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="fb-goals__students-list" aria-label="Meus alunos">
        {visible.map((student) => (
          <li key={student.id}>
            <button
              type="button"
              className={`fb-goals__student${student.id === selectedId ? " fb-goals__student--active" : ""}`}
              onClick={() => onSelect(student.id)}
            >
              {student.fullName}
            </button>
          </li>
        ))}
      </ul>
      <span className="fb-goals__students-note">
        {allStudents
          ? "Você tem acesso a todos os clientes ativos."
          : "Lista filtrada pelos alunos vinculados ao professor logado."}
      </span>
    </aside>
  );
}
