import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { join } from "./join";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "aria-checked" | "children"> {
  /** Texto do controle: é o nome acessível do interruptor. */
  label: ReactNode;
  /** Explicação curta abaixo do rótulo; vira a descrição acessível. */
  description?: ReactNode;
  /** Rótulo só para leitores de tela (switch numa linha de tabela, em que a linha já diz do que se trata). */
  hideLabel?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Interruptor base (D-038): liga/desliga uma regra já na tela (diferente do Checkbox, que marca uma escolha). É um
 * `<button role="switch">` com `aria-checked`, rótulo e descrição ligados por `aria-labelledby`/`aria-describedby`,
 * alvo de toque de 44px. Estilo em `styles/components.css` (`.fb-ui-switch`); só tokens.
 */
export function Switch({ label, description, hideLabel, checked, onChange, className, id, disabled, ...rest }: SwitchProps) {
  const generated = useId();
  const switchId = id ?? generated;
  const labelId = `${switchId}-label`;
  const descriptionId = `${switchId}-desc`;
  return (
    <div className={join("fb-ui-switch", className)}>
      <div className={join("fb-ui-switch__text", hideLabel && "fb-ui-sr-only")}>
        <span id={labelId} className="fb-ui-switch__label">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="fb-ui-switch__description">
            {description}
          </span>
        )}
      </div>
      <button
        {...rest}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        className="fb-ui-switch__control"
        onClick={() => onChange(!checked)}
      >
        <span className="fb-ui-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
