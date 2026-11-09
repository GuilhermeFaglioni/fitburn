/** Traços na cor do texto do pai (`currentColor`): o tema decide a cor. Decorativos: o significado vai no texto. */
const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...ICON} width={size} height={size}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg {...ICON} width={size} height={size}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
