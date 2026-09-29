/** Simula o estado online/offline do navegador (navigator.onLine + o evento correspondente). */
export function setBrowserOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}
