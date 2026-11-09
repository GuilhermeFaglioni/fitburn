import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Telas do cliente (DS6, decisão 134 e seção 5 do fluxo): Home, Agenda, detalhe da aula e Login.
 * Lê o CSS e o TSX do disco.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const login = read("pages/LoginPage.tsx");
const loginCss = read("pages/LoginPage.css");
const homeCss = read("styles/home.css");
const clientLayout = read("components/ClientLayout.tsx");
const clientNavIcons = read("components/icons/ClientNavIcons.tsx");
const flameMark = read("components/icons/FlameMark.tsx");
const agendaCss = read("styles/agenda.css");
const clientCss = read("styles/client.css");
const agendaTsx = [
  read("pages/ClientAgendaPage.tsx"),
  read("pages/client/ClassItem.tsx"),
  read("pages/client/ReservationHistory.tsx"),
  read("components/QueryBlockState.tsx"),
].join("\n");
const homeTsx = [
  read("pages/ClientHomePage.tsx"),
  read("pages/home/HomeReservations.tsx"),
  read("pages/home/HomeBlockState.tsx"),
].join("\n");

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?)\(/g;

describe("login: erro ligado ao campo", () => {
  it("a senha marca aria-invalid e aponta para a mensagem; a mensagem é o Alert compartilhado (role=alert)", () => {
    expect(login.match(/aria-invalid=\{showError \|\| undefined\}/g) ?? []).toHaveLength(1);
    expect(login.match(/aria-describedby=\{showError \? errorId : undefined\}/g) ?? []).toHaveLength(1);
    expect(login).toMatch(/<Alert id=\{errorId\}>/);
    // Alert tem role="alert" por padrão para o tom de erro (ver ui-components.test).
    expect(read("components/ui/Alert.tsx")).toMatch(/tone === "err" \? "alert"/);
  });

  it("usa os componentes compartilhados de ui/ e não repete o CSS deles (campo, botão, estado offline)", () => {
    expect(login).toMatch(/<Field\b/);
    expect(login).toMatch(/<Button type="submit" variant="primary" block busy=\{isSubmitting\}>/);
    expect(login).toMatch(/<OfflineState\b/);
    expect(loginCss).not.toMatch(/\.login-form/);
    expect(login).not.toMatch(/stroke="#|fill="#|rgba?\(/);
  });

  it("o CSS do login usa só tokens da base: sem rgba/hsla e sem os --color-* legados", () => {
    expect(loginCss.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(loginCss).not.toMatch(/var\(--color-/);
    expect(loginCss).not.toMatch(/border-radius:\s*\d/);
  });

  it("o cartão do formulário usa --r-lg e --sh-2, com 16px de margem lateral (--container-gutter)", () => {
    expect(loginCss).toMatch(/\.login-card\s*\{[^}]*border-radius:\s*var\(--r-lg\)/);
    expect(loginCss).toMatch(/\.login-card\s*\{[^}]*box-shadow:\s*var\(--sh-2\)/);
    expect(loginCss).toMatch(/\.login-page\s*\{[^}]*padding:[^;]*var\(--container-gutter\)/);
    expect(read("styles/tokens.css")).toMatch(/--container-gutter:\s*var\(--s-4\)/);
  });

  it("o botão de tema da tela é o ThemeToggle compartilhado, no cabeçalho da própria tela", () => {
    expect(login).toMatch(/useHostThemeToggle\(\)/);
    expect(login).toMatch(/<ThemeToggle inline \/>/);
  });
});

describe("cores das telas do cliente", () => {
  it("home.css e LoginPage.css não têm cor hex literal", () => {
    expect(homeCss.match(HEX) ?? []).toEqual([]);
    expect(loginCss.match(HEX) ?? []).toEqual([]);
  });

  it("home.css não tem rgba/hsla literal nem usa os --color-* legados: só tokens da base", () => {
    expect(homeCss.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(homeCss).not.toMatch(/var\(--color-(?!on-orange)/);
    expect(homeCss).not.toMatch(/var\(--radius-/);
  });

  it("a casca e a Home do cliente (TSX) não têm cor literal: ícones usam currentColor", () => {
    for (const source of [clientLayout, clientNavIcons, flameMark, homeTsx]) {
      expect(source.match(HEX) ?? []).toEqual([]);
      expect(source.match(COLOR_FUNCTION) ?? []).toEqual([]);
    }
    expect(clientLayout).not.toMatch(/\bACTIVE\b|\bINACTIVE\b/);
    expect(clientNavIcons).not.toMatch(/stroke="/);
  });

  it("os estados da Home vêm dos componentes compartilhados de ui/States, sem a prop surface", () => {
    expect(homeTsx).toContain("components/ui/States");
    expect(homeTsx).not.toMatch(/surface=/);
  });
});

describe("Agenda do cliente (D-038)", () => {
  it("agenda.css só usa tokens da base: sem hex, rgba/hsla, --color-* legado nem --radius-*", () => {
    expect(agendaCss.match(HEX) ?? []).toEqual([]);
    expect(agendaCss.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(agendaCss).not.toMatch(/var\(--color-/);
    expect(agendaCss).not.toMatch(/var\(--radius-/);
    expect(agendaCss).not.toMatch(/border-radius:\s*\d/);
  });

  it("a agenda (TSX) não tem cor literal nem a prop surface; os estados vêm de ui/States", () => {
    expect(agendaTsx.match(HEX) ?? []).toEqual([]);
    expect(agendaTsx.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(agendaTsx).not.toMatch(/surface=/);
    expect(agendaTsx).not.toContain('components/states"');
    expect(agendaTsx).toContain("components/ui/States");
  });

  it("os controles vêm dos componentes compartilhados (Segmented, Chip, Pill, Badge), sem os botões antigos", () => {
    for (const component of ["Segmented", "Chip", "Pill", "Badge"]) {
      expect(agendaTsx).toContain(`components/ui/${component}`);
    }
    expect(agendaTsx).not.toMatch(/fb-daychip|fb-client-tab-btn|fb-filter-chip|fb-class-card/);
  });

  it("os grupos de dia, modalidade, visão e situação têm nome acessível", () => {
    for (const label of [
      'aria-label="Dia"',
      'aria-label="Modalidade"',
      'aria-label="Filtrar por estado"',
      'label="Visão"',
    ]) {
      expect(agendaTsx).toContain(label);
    }
  });

  it("o CSS da agenda e o da folha de detalhe saíram de client.css (fica só a casca e as abas do FitPoints)", () => {
    expect(clientCss).not.toMatch(
      /\.fb-(daychip|class-card|filter-chip|reservation-|client-grid|client-cell|client-chip)/,
    );
    expect(clientCss).not.toMatch(/\.fb-sheet/);
    expect(clientCss).toContain(".fb-client-tab-btn");
  });
});
