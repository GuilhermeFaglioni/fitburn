import type { ReactElement } from "react";

/**
 * Ícones da navegação do cliente (traço da proposta, viewBox 24). Só o desenho: cor, espessura e tamanho vêm do CSS
 * do contêiner (`currentColor`), então seguem o tema e o estado ativo sem cor literal.
 */
const svgProps = { viewBox: "0 0 24 24", focusable: false, "aria-hidden": true } as const;

export function HomeNavIcon(): ReactElement {
  return (
    <svg {...svgProps}>
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function AgendaNavIcon(): ReactElement {
  return (
    <svg {...svgProps}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

export function FitPointsNavIcon(): ReactElement {
  return (
    <svg {...svgProps}>
      <path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" />
    </svg>
  );
}

export function WorkoutNavIcon(): ReactElement {
  return (
    <svg {...svgProps}>
      <path d="M6 4h12v16H6z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export function ProfileNavIcon(): ReactElement {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
