import { parseOrThrow } from "../auth/api";
import { authFetch } from "../auth/authFetch";

/** Extrai o nome do arquivo do `Content-Disposition`; sem ele (ou se for suspeito), devolve null. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"|filename=([^;\s]+)/i.exec(header);
  const name = match?.[1] ?? match?.[2];
  // Nome com separador de caminho ou caractere de controle não vira nome de arquivo.
  if (!name || name.includes("/") || name.includes("\\")) return null;
  if ([...name].some((char) => char.charCodeAt(0) < 32)) return null;
  return name;
}

/**
 * Baixa um CSV protegido pelo token da sessão: `<a href>` não envia o
 * `Authorization`, então a requisição é feita com `authFetch` e o arquivo entregue
 * ao navegador por um link temporário. Usa o `blob()` (e não o `text()`) para que
 * os bytes, o BOM inclusive, cheguem ao arquivo exatamente como a API enviou.
 * Erros da API (400, 403...) são lançados como `ApiError`.
 */
export async function downloadCsv(
  path: string,
  params: Record<string, string>,
  fallbackFilename: string,
): Promise<void> {
  const query = new URLSearchParams(params).toString();
  const response = await authFetch(query ? `${path}?${query}` : path);
  if (!response.ok) await parseOrThrow(response);

  const filename = filenameFromDisposition(response.headers.get("Content-Disposition"));
  const blob = await response.blob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename ?? fallbackFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Liberar na hora pode cancelar o download em alguns navegadores: dá um respiro antes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
