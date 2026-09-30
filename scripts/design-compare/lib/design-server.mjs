import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DESIGN_DIR } from "./paths.mjs";

const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant:wght@500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap">';

/**
 * Servidor estático mínimo para os artboards `.dc.html`.
 *
 * - `/support.js` é o runtime do Design (`artifact-type/dc-runtime.js`), o mesmo
 *   que o canvas do Claude Design carrega;
 * - as props do artboard (`this.props.x`) são trocadas por `window.__DCP.x`,
 *   e `window.__DCP` é preenchido por requisição (`?props=<json>`), o que
 *   permite renderizar os estados alternativos (erro, sem plano, cenário...).
 */
export function startDesignServer() {
  const project = path.join(DESIGN_DIR, "project");
  const runtime = path.join(DESIGN_DIR, "artifact-type", "dc-runtime.js");
  if (!fs.existsSync(runtime) || !fs.existsSync(path.join(project, "canvas.json"))) {
    throw new Error(
      `Design não encontrado em ${DESIGN_DIR}. Baixe project/*.dc.html, project/canvas.json e ` +
        "artifact-type/dc-runtime.js do artefato do Claude Design (veja o README) ou defina DESIGN_DIR.",
    );
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const name = decodeURIComponent(url.pathname);
    if (name === "/support.js") {
      res.setHeader("content-type", "text/javascript");
      return res.end(fs.readFileSync(runtime));
    }
    const file = path.join(project, path.normalize(name).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(project) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("not found");
    }
    if (name.endsWith(".dc.html")) {
      const props = url.searchParams.get("props") ?? "{}";
      let html = fs.readFileSync(file, "utf8").replaceAll("this.props.", "window.__DCP.");
      html = html.replace(
        /<script src="\.\/support\.js"><\/script>/,
        `<script>window.__DCP = ${props.replaceAll("<", "\\u003c")};</script>\n<script src="./support.js"></script>`,
      );
      // O `@import` das fontes vem depois de outras regras nos artboards, então o
      // navegador o ignora; o design pretende Cormorant + DM Sans (como o app).
      html = html.replace("</head>", `${FONT_LINK}\n</head>`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(html);
    }
    res.setHeader("content-type", name.endsWith(".json") ? "application/json" : "application/octet-stream");
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export function readCanvas() {
  return JSON.parse(fs.readFileSync(path.join(DESIGN_DIR, "project", "canvas.json"), "utf8"));
}
