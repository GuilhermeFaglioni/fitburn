import { join } from "./join";

export interface MeterProps {
  /** Quanto está preenchido (por exemplo, vagas ocupadas). */
  value: number;
  /** Total que enche a barra (por exemplo, a capacidade). */
  max: number;
  /** Texto lido por leitores de tela: o valor vai por extenso, nunca só na barra. */
  label: string;
  className?: string;
}

/**
 * Barra de medida (#156, D-038): trilha `--surface-2` com preenchimento `--grad-cta`. Informativa e decorativa para
 * quem enxerga: o número já está em texto ao lado, e `label` o repete para leitores de tela (`role="img"`). Revela da
 * esquerda com os motion tokens e, com reduced motion, só faz fade.
 */
export function Meter({ value, max, label, className }: MeterProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div role="img" aria-label={label} className={join("fb-ui-meter", className)}>
      <i className="fb-ui-meter__fill" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
