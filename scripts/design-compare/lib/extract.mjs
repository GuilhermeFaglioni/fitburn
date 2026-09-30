/**
 * Extrai da página (design ou app) o que dá para comparar por medidas, sem
 * depender de pixels: cada texto visível com posição, tipografia e cor, e a
 * "caixa" (fundo/borda/raio) mais próxima que o contém; mais os ícones (svg).
 */
export async function extractPage(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 2) / 2;
    const visible = (el) => {
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const transparent = (c) => !c || c === "transparent" || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(c);
    const boxOf = (el) => {
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        const s = getComputedStyle(node);
        const hasBorder = ["Top", "Right", "Bottom", "Left"].some(
          (side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none",
        );
        if (!transparent(s.backgroundColor) || hasBorder) {
          const r = node.getBoundingClientRect();
          return {
            tag: node.tagName.toLowerCase(),
            cls: (node.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
            x: round(r.left + scrollX),
            y: round(r.top + scrollY),
            w: round(r.width),
            h: round(r.height),
            bg: s.backgroundColor,
            radius: s.borderTopLeftRadius,
            border: hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` : "",
            padding: s.padding,
            shadow: s.boxShadow === "none" ? "" : s.boxShadow,
          };
        }
      }
      return null;
    };
    const describe = (el, rect, text) => {
      const s = getComputedStyle(el);
      return {
        text,
        x: round(rect.left + scrollX),
        y: round(rect.top + scrollY),
        w: round(rect.width),
        h: round(rect.height),
        font: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        size: s.fontSize,
        weight: s.fontWeight,
        color: s.color,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        transform: s.textTransform,
        decoration: s.textDecorationLine === "none" ? "" : s.textDecorationLine,
        tag: el.tagName.toLowerCase(),
        box: boxOf(el),
      };
    };

    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const raw = node.textContent.replace(/\s+/g, " ").trim();
      const el = node.parentElement;
      if (!raw || !el || ["SCRIPT", "STYLE", "NOSCRIPT", "X-DC", "HELMET"].includes(el.tagName)) continue;
      if (!visible(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      texts.push(describe(el, rect, raw));
    }
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      const value = el.tagName === "SELECT" ? el.selectedOptions[0]?.textContent?.trim() : el.value;
      const text = value ? value : el.getAttribute("placeholder") || "";
      if (!text || el.type === "password") continue;
      texts.push({ ...describe(el, rect, text), field: true });
    }

    const icons = [];
    for (const svg of document.querySelectorAll("svg")) {
      if (!visible(svg)) continue;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) continue;
      const first = svg.querySelector("path, circle, rect, line, polyline");
      const s = first ? getComputedStyle(first) : getComputedStyle(svg);
      icons.push({
        x: round(r.left + scrollX),
        y: round(r.top + scrollY),
        w: round(r.width),
        h: round(r.height),
        stroke: s.stroke,
        fill: s.fill,
        color: getComputedStyle(svg).color,
        shapes: svg.querySelectorAll("path, circle, rect, line, polyline").length,
      });
    }
    return { texts, icons, page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } };
  });
}
