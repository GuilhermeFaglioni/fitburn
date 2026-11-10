export interface TextPart {
  text: string;
  em: boolean;
}

/** Divide "Texto com *ênfase* no meio." em partes; a parte entre asteriscos é a ênfase em itálico. */
export function splitEmphasis(input: string): TextPart[] {
  return input
    .split("*")
    .map((text, index) => ({ text, em: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

/** O mesmo texto sem as marcas de ênfase. */
export function stripEmphasis(input: string): string {
  return input.replaceAll("*", "");
}
