// Gera laudos InBody120 SINTÉTICOS (valores fictícios) sobre a base mascarada.
//
// Uso: node scripts/laudo/gerar-sinteticos.mjs <pasta-de-saida> [--so=novo,antigo,borrado,nao-laudo]
//
// Variantes: "novo" (LookinBody 5.x, com Massa livre de gordura), "antigo" (3.x, sem ela),
// "borrado" (novo com um dígito ilegível) e "nao-laudo" (imagem qualquer).
// Também exporta `gerarLaudo` e `VALORES_SINTETICOS` para os testes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const aqui = dirname(fileURLToPath(import.meta.url));
export const gabarito = JSON.parse(readFileSync(join(aqui, "../../src/lib/bioimpedance/reader/template.json"), "utf8"));
const BASE = join(aqui, "../../test/fixtures/laudo/base-mascarada.png");

/** Valores fictícios e coerentes entre si (soma da composição = peso). Nenhum vem de pessoa real. */
export const VALORES_SINTETICOS = {
  header: { measuredAt: "15.03.2027. 09:30", height: "178", age: "30", id: "000000-0", nome: "(Fulana de Tal...)" },
  numeros: {
    totalBodyWater: 45.1, protein: 12.2, minerals: 4.3, bodyFatMass: 20.8, weight: 82.4,
    bmi: 26.0, bodyFatPercent: 25.2, inbodyScore: 76,
    targetWeight: 77.5, weightControl: -4.9, fatControl: -5.1, muscleControl: 0.2,
    skeletalMuscleMass: 36.0, fatFreeMass: 61.6, basalMetabolicRate: 1710, waistHipRatio: 0.88,
    visceralFatLevel: 7, obesityDegree: 112,
    leanLeftArm: 3.45, leanRightArm: 3.52, leanTrunk: 28.4, leanLeftLeg: 9.38, leanRightLeg: 9.41,
    leanLeftArmPercent: 101.2, leanRightArmPercent: 103.4, leanTrunkPercent: 99.0, leanLeftLegPercent: 96.7, leanRightLegPercent: 97.1,
    fatLeftArm: 1.1, fatRightArm: 1.1, fatTrunk: 10.2, fatLeftLeg: 2.9, fatRightLeg: 2.9,
    fatLeftArmPercent: 140.3, fatRightArmPercent: 141.8, fatTrunkPercent: 188.0, fatLeftLegPercent: 120.5, fatRightLegPercent: 121.9,
    impedance20RightArm: 301.4, impedance20LeftArm: 309.9, impedance20Trunk: 24.6, impedance20RightLeg: 262.8, impedance20LeftLeg: 270.3,
    impedance100RightArm: 277.7, impedance100LeftArm: 284.2, impedance100Trunk: 20.9, impedance100RightLeg: 241.5, impedance100LeftLeg: 247.8,
  },
  ratings: {
    leanLeftArm: "Normal", leanRightArm: "Normal", leanTrunk: "Normal", leanLeftLeg: "Normal", leanRightLeg: "Normal",
    fatLeftArm: "Normal", fatRightArm: "Normal", fatTrunk: "Acima", fatLeftLeg: "Normal", fatRightLeg: "Normal",
  },
};

const DECIMAIS = {
  inbodyScore: 0, basalMetabolicRate: 0, visceralFatLevel: 0, obesityDegree: 0, waistHipRatio: 2,
  leanLeftArm: 2, leanRightArm: 2, leanTrunk: 1, leanLeftLeg: 2, leanRightLeg: 2,
  fatLeftArm: 1, fatRightArm: 1, fatTrunk: 1, fatLeftLeg: 1, fatRightLeg: 1,
};
const fmt = (chave, v) => v.toFixed(DECIMAIS[chave] ?? 1).replace(".", ",");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const campo = (chave) => gabarito.fields.find((f) => f.key === chave);

const FONTE = "Liberation Sans, Arial, sans-serif";
/** Texto com a linha de base no centro vertical do retângulo. */
const texto = (s, x, y, tam, { anchor = "start", peso = 400, cor = "#111" } = {}) =>
  `<text xml:space="preserve" x="${x}" y="${y}" font-family="${FONTE}" font-size="${tam}" font-weight="${peso}" fill="${cor}" text-anchor="${anchor}" dominant-baseline="central">${esc(s)}</text>`;

function desenharNumero(chave, valores, svg) {
  const f = campo(chave);
  if (!f || valores[chave] === undefined) return;
  const [x0, y0, x1, y1] = f.rect;
  const cy = Math.round((y0 + y1) / 2);
  const tam = Math.round((y1 - y0) * 0.78);
  if (f.mode === "band") {
    // valor acompanha a barra: barra proporcional + número logo depois, com régua de referência acima
    const barraFim = x0 + 60 + Math.round(Math.min(valores[chave] / 60, 1) * (x1 - x0 - 200));
    svg.push(`<rect x="${x0 + 2}" y="${y0 + 6}" width="${barraFim - x0}" height="14" fill="#111"/>`);
    svg.push(texto(fmt(chave, valores[chave]), barraFim + 10, cy + 2, tam, { peso: 400 }));
    for (let i = 0; i < 8; i++) svg.push(texto(String(10 * (i + 1)) + ",0", x0 + 20 + i * 80, y0 - 14, 13, { anchor: "start" }));
    return;
  }
  if (f.mode === "anchor") return; // desenhado junto da linha do rótulo
  const sufixo = f.unit === "kg" ? "kg" : f.unit === "%" ? "%" : f.unit === "cm" ? "cm" : "";
  const alinhado = f.rect[2] - f.rect[0] > 120 && /^(lean|fat)/.test(chave);
  const x = alinhado ? Math.round((x0 + x1) / 2) : x1 - 6;
  svg.push(texto(fmt(chave, valores[chave]) + sufixo, x, cy, tam, { anchor: alinhado ? "middle" : "end" }));
}

/** Monta o laudo. layout: "novo" | "antigo". borrar: chaves cujo valor fica ilegível. */
export async function gerarLaudo({ layout = "novo", valores = VALORES_SINTETICOS, borrar = [] } = {}) {
  const num = { ...valores.numeros };
  if (layout === "antigo") delete num.fatFreeMass;
  const svg = [];
  const h = valores.header;
  const campoH = (k) => campo(k).rect;
  const centro = (r) => Math.round((r[1] + r[3]) / 2);
  svg.push(texto(h.id, 70, 190, 26));
  svg.push(texto(h.nome, 70, 222, 20));
  svg.push(texto(`${h.height}cm`, ...[campoH("height")[0], centro(campoH("height")), 26]));
  svg.push(texto(h.age, campoH("age")[0], centro(campoH("age")), 26));
  svg.push(texto("Masculino", 568, 190, 20));
  svg.push(texto(h.measuredAt, campoH("measuredAt")[0], centro(campoH("measuredAt")), 26));
  const especiais = /^(impedance|inbodyScore|targetWeight|weightControl|fatControl|muscleControl)/;
  for (const chave of Object.keys(num)) if (!especiais.test(chave)) desenharNumero(chave, num, svg);
  // avaliação (Abaixo/Normal/Acima) dos segmentos
  for (const [chave, rating] of Object.entries(valores.ratings)) {
    const [x0, y0, x1, y1] = campo(`${chave}Rating`).rect;
    svg.push(texto(rating, Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2), 24, { anchor: "middle" }));
  }
  // coluna direita: pontuação e rótulo + valor das linhas de "Dados adicionais"
  const [px0, py0, px1, py1] = campo("inbodyScore").rect;
  svg.push(texto(String(num.inbodyScore), Math.round((px0 + px1) / 2), Math.round((py0 + py1) / 2), 46, { anchor: "middle" }));
  svg.push(texto("/100 Pontos", px1 + 6, Math.round((py0 + py1) / 2) + 6, 24));
  const rotulosControle = [["targetWeight", "Peso Ideal"], ["weightControl", "Controle de Peso"], ["fatControl", "Controle de Gordura"], ["muscleControl", "Controle Muscular"]];
  for (const [k, rotulo] of rotulosControle) {
    const [, y0, x1, y1] = campo(k).rect;
    svg.push(texto(rotulo, 927, Math.round((y0 + y1) / 2), 20));
    const v = num[k];
    const sinal = k === "targetWeight" ? "" : v < 0 ? "- " : "+ ";
    svg.push(texto(`${sinal}${fmt(k, Math.abs(v))}`, x1 - 6, Math.round((y0 + y1) / 2), 24, { anchor: "end" }));
  }
  const linhas = ["skeletalMuscleMass", "fatFreeMass", "basalMetabolicRate", "waistHipRatio", "visceralFatLevel", "obesityDegree"].filter((k) => num[k] !== undefined);
  const unidades = { skeletalMuscleMass: "kg", fatFreeMass: "kg", basalMetabolicRate: "kcal", obesityDegree: "%" };
  const y0 = Math.round(728 * (2000 / 2288));
  const passo = Math.round(37 * (2000 / 2288));
  linhas.forEach((k, i) => {
    const y = y0 + i * passo;
    const a = campo(k);
    // fonte condensada do laudo: encaixa o rótulo na largura da coluna
    svg.push(texto(a.label, a.labelRect[0], y, 18).replace("<text ", `<text textLength="${a.rect[0] - a.labelRect[0] - 24}" lengthAdjust="spacingAndGlyphs" `));
    svg.push(texto(`${fmt(k, num[k])}${unidades[k] ? " " + unidades[k] : ""}`, a.rect[0] + 28, y, 26));
  });
  // impedância
  const cabecalho = [["BD", "RightArm"], ["BE", "LeftArm"], ["TR", "Trunk"], ["PD", "RightLeg"], ["PE", "LeftLeg"]];
  for (const [, seg] of cabecalho) {
    for (const freq of [20, 100]) {
      const f = campo(`impedance${freq}${seg}`);
      svg.push(texto(fmt(`impedance${freq}${seg}`, num[`impedance${freq}${seg}`]), Math.round((f.rect[0] + f.rect[2]) / 2), Math.round((f.rect[1] + f.rect[3]) / 2), 20, { anchor: "middle" }));
    }
  }
  // dígito ilegível: um retângulo cinza com ruído cobre o último dígito do campo
  for (const chave of borrar) {
    const [, y0, x1, y1] = campo(chave).rect;
    svg.push(`<rect x="${x1 - 24}" y="${y0 + 4}" width="14" height="${y1 - y0 - 8}" fill="#9a9a9a" opacity="0.85" filter="url(#b)"/>`);
  }
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${gabarito.width}" height="${gabarito.height}"><defs><filter id="b"><feGaussianBlur stdDeviation="3"/></filter></defs>${svg.join("")}</svg>`;
  return sharp(BASE).composite([{ input: Buffer.from(doc) }]).png().toBuffer();
}

/** Imagem que não é um laudo: degradê com blocos de texto qualquer. */
export async function gerarNaoLaudo() {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="1420" height="2000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7aa2c8"/><stop offset="1" stop-color="#e9c46a"/></linearGradient></defs><rect width="1420" height="2000" fill="url(#g)"/><circle cx="700" cy="900" r="320" fill="#264653" opacity="0.6"/>${texto("Treino de hoje", 200, 300, 90, { peso: 700, cor: "#fff" })}</svg>`;
  return sharp(Buffer.from(doc)).png().toBuffer();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saida = process.argv[2];
  if (!saida) {
    console.error("Uso: node scripts/laudo/gerar-sinteticos.mjs <pasta-de-saida>");
    process.exit(1);
  }
  mkdirSync(saida, { recursive: true });
  const jobs = {
    "novo.png": () => gerarLaudo({ layout: "novo" }),
    "antigo.png": () => gerarLaudo({ layout: "antigo" }),
    "borrado.png": () => gerarLaudo({ layout: "novo", borrar: ["weight"] }),
    "nao-laudo.png": () => gerarNaoLaudo(),
  };
  for (const [nome, fazer] of Object.entries(jobs)) {
    writeFileSync(join(saida, nome), await fazer());
    console.log("gerado", nome);
  }
}
