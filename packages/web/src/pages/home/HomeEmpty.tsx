import type { ReactNode } from "react";
import { EmptyState } from "../../components/ui/States";

/** Estado vazio compacto da Home (faixa tracejada da proposta). */
export function HomeEmpty({ title, action }: { title: string; action?: ReactNode }) {
  return <EmptyState className="fb-home__state" title={title} action={action} />;
}
