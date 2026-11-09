import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { join } from "./join";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Texto do controle: é o nome acessível do checkbox. */
  label: ReactNode;
}

/**
 * Checkbox base (#156, D-038): caixa nativa (teclado, leitor de tela e `checked` de graça) na cor da marca, com o
 * rótulo clicável e alvo de toque de 44px. Só tokens; estilo em `styles/components.css` (`.fb-ui-check`).
 */
export function Checkbox({ label, id, className, ...input }: CheckboxProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label htmlFor={inputId} className={join("fb-ui-check", className)}>
      <input {...input} id={inputId} type="checkbox" className="fb-ui-check__input" />
      <span className="fb-ui-check__label">{label}</span>
    </label>
  );
}
