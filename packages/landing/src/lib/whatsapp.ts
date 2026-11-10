import { site } from "../content/site";

/** Link do WhatsApp com a mensagem pronta (acentos e pontuação codificados). */
export function whatsappUrl(message: string, number: string = site.whatsapp.number): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
