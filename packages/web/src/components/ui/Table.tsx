import type { Key, ReactNode } from "react";
import { join } from "./join";

export interface TableColumn<Row> {
  key: string;
  /** Texto do cabeçalho (obrigatório também na coluna de ações, para leitores de tela). */
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Coluna de ações: alinhada à direita e sem quebra de linha. */
  actions?: boolean;
  /** Classe extra da coluna (cabeçalho e células), ex.: `fb-ui-table__name` para o nome do registro. */
  className?: string;
}

export interface TableProps<Row> {
  /** Nome da tabela para leitores de tela (vira o nome da região rolável). */
  label: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => Key;
  /** Conteúdo quando não há linhas. */
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela base (#156, D-038). A rolagem horizontal fica no contêiner (`overflow-x: auto`), que é uma região focável
 * e rotulada: a página nunca rola na horizontal. O hover da linha só vale em dispositivos com ponteiro.
 */
export function Table<Row>({ label, columns, rows, rowKey, empty, className }: TableProps<Row>) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={join("fb-ui-table-wrap", className)}>
      <table className="fb-ui-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={join(column.actions && "fb-ui-table__actions", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty != null ? (
            <tr>
              <td colSpan={columns.length} className="fb-ui-table__empty">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} className={join(column.actions && "fb-ui-table__actions", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
