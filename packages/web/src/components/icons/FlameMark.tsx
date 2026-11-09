/** Marca da chama do Fitburn (dois gomos). As cores vêm do CSS (`--flame` e `--brand`), então não há hex aqui. */
export function FlameMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path
        className="fb-flame__back"
        transform="rotate(-8 210 270)"
        d="M210,100 C312.5,156.7 305,383.3 210,440 C115,383.3 107.5,156.7 210,100 Z"
      />
      <path
        className="fb-flame__front"
        transform="rotate(7 300 250)"
        d="M300,70 C436.5,132 392.5,368 300,430 C207.5,368 163.5,132 300,70 Z"
      />
    </svg>
  );
}
