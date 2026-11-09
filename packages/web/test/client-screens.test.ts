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
const gamificationCss = read("styles/gamification.css");
const workoutCss = read("styles/workout.css");
// Só a parte do cliente: o editor do professor (acima do marcador) ainda usa os --color-* legados (PR 17).
const clientWorkoutCss = workoutCss.slice(workoutCss.indexOf("/* ---------- Cliente: ficha ativa"));
const workoutTsx = [
  read("pages/ClientWorkoutSheetsPage.tsx"),
  read("pages/ClientWorkoutSheetPage.tsx"),
  read("pages/workout-sheets/ClientSheetView.tsx"),
  read("pages/workout-sheets/PreviousSheetItem.tsx"),
].join("\n");
const gamificationTsx = [
  read("pages/GamificationPage.tsx"),
  read("pages/gamification/Achievements.tsx"),
  read("pages/gamification/GoalsSection.tsx"),
  read("pages/gamification/HistorySection.tsx"),
  read("pages/gamification/PointsCard.tsx"),
  read("pages/gamification/RankingConsentControl.tsx"),
  read("pages/gamification/RankingSection.tsx"),
  read("pages/gamification/icons.tsx"),
].join("\n");
const profileCss = read("styles/profile.css");
// plan.css é só do plano do cliente: a consulta da administração é uma tabela (lote D, PR 16).
const clientPlanCss = read("styles/plan.css");
const profileTsx = [
  read("pages/ProfilePage.tsx"),
  read("pages/OnboardingPage.tsx"),
  read("pages/LegalDocumentPage.tsx"),
  read("pages/plans/MyPlanSection.tsx"),
  read("pages/gamification/RankingConsentControl.tsx"),
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
    expect(
      login.match(/aria-describedby=\{showError \? errorId : undefined\}/g) ?? [],
    ).toHaveLength(1);
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

  it("o CSS da agenda e o da folha de detalhe saíram de client.css (fica só a casca; as abas do FitPoints viraram o Segmented)", () => {
    expect(clientCss).not.toMatch(
      /\.fb-(daychip|class-card|filter-chip|reservation-|client-grid|client-cell|client-chip)/,
    );
    expect(clientCss).not.toMatch(/\.fb-sheet/);
    expect(clientCss).not.toMatch(/\.fb-client-tab/);
  });
});

describe("Ficha de treino do cliente (D-038, tela extrapolada da base)", () => {
  it("a parte do cliente de workout.css só usa tokens da base: sem hex, rgba/hsla, --color-* legado nem --radius-*", () => {
    expect(clientWorkoutCss.length).toBeGreaterThan(500);
    expect(clientWorkoutCss.match(HEX) ?? []).toEqual([]);
    expect(clientWorkoutCss.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(clientWorkoutCss).not.toMatch(/var\(--color-/);
    expect(clientWorkoutCss).not.toMatch(/var\(--radius-/);
    expect(clientWorkoutCss).not.toMatch(/border-radius:\s*\d/);
  });

  it("a ficha (TSX) não tem cor literal nem a prop surface; estados, card e selo vêm de ui/", () => {
    expect(workoutTsx.match(HEX) ?? []).toEqual([]);
    expect(workoutTsx.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(workoutTsx).not.toMatch(/surface=/);
    expect(workoutTsx).not.toContain('components/states"');
    for (const component of ["ui/States", "ui/Card", "ui/Badge"]) {
      expect(workoutTsx).toContain(`components/${component}`);
    }
    expect(workoutTsx).toContain("QueryBlockState");
  });

  it("o alvo de toque do voltar tem 44px e o card da ficha anterior não baixa a opacidade (contraste)", () => {
    expect(clientWorkoutCss).toMatch(/\.fb-workout__back\s*\{[^}]*min-height:\s*44px/);
    expect(clientWorkoutCss).not.toMatch(/opacity:/);
  });
});

describe("FitPoints do cliente (D-038, tela extrapolada da base)", () => {
  it("gamification.css só usa tokens da base: sem hex, rgba/hsla, --color-* legado nem --radius-*", () => {
    expect(gamificationCss.length).toBeGreaterThan(500);
    expect(gamificationCss.match(HEX) ?? []).toEqual([]);
    expect(gamificationCss.match(COLOR_FUNCTION) ?? []).toEqual([]);
    // O branco sobre o laranja é o token --color-on-orange (exceção da base); nenhum outro --color-*.
    expect(gamificationCss).not.toMatch(/var\(--color-(?!on-orange)/);
    expect(gamificationCss).not.toMatch(/var\(--radius-/);
    expect(gamificationCss).not.toMatch(/border-radius:\s*\d/);
    expect(gamificationCss).not.toMatch(/opacity:/);
  });

  it("a tela (TSX) não tem cor literal nem a prop surface; estados e controles vêm de ui/", () => {
    expect(gamificationTsx.match(HEX) ?? []).toEqual([]);
    expect(gamificationTsx.match(COLOR_FUNCTION) ?? []).toEqual([]);
    // `surface` do RankingConsentControl é a variante da tela, não o tema dos estados legados ("dark" | "light").
    expect(gamificationTsx).not.toMatch(/surface="(?:dark|light)"/);
    expect(gamificationTsx).not.toContain('components/states"');
    for (const component of ["ui/States", "ui/Card", "ui/Badge", "ui/Meter", "ui/Segmented"]) {
      expect(gamificationTsx).toContain(`components/${component}`);
    }
    expect(gamificationTsx).toContain("QueryBlockState");
    expect(gamificationTsx).not.toMatch(/fb-client-tab/);
  });

  it("o ícone de cadeado e o de check usam currentColor, sem rgba nem hex", () => {
    const icons = read("pages/gamification/icons.tsx");
    expect(icons).toContain('stroke: "currentColor"');
    expect(icons.match(COLOR_FUNCTION) ?? []).toEqual([]);
  });

  it("o seletor do ranking tem alvo de toque de 44px", () => {
    expect(gamificationCss).toMatch(/\.fb-gami__tabs button\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("Perfil, Onboarding, Privacidade e Termos (D-038, telas extrapoladas da base)", () => {
  it("profile.css e plan.css só usam tokens da base: sem hex, rgba/hsla, --color-* legado nem --radius-*", () => {
    for (const css of [profileCss, clientPlanCss]) {
      expect(css.length).toBeGreaterThan(500);
      expect(css.match(HEX) ?? []).toEqual([]);
      expect(css.match(COLOR_FUNCTION) ?? []).toEqual([]);
      expect(css).not.toMatch(/var\(--color-/);
      expect(css).not.toMatch(/var\(--radius-/);
      expect(css).not.toMatch(/border-radius:\s*\d/);
      expect(css).not.toMatch(/opacity:/);
    }
    // Sem a variante clara do perfil: o tema decide (os tokens valem nas duas cascas).
    expect(profileCss).not.toMatch(/fb-profile--light|--fb-profile-/);
  });

  it("as telas (TSX) não têm cor literal nem a prop surface; estados, card, campo, botão e selo vêm de ui/", () => {
    expect(profileTsx.match(HEX) ?? []).toEqual([]);
    expect(profileTsx.match(COLOR_FUNCTION) ?? []).toEqual([]);
    expect(profileTsx).not.toMatch(/surface="(?:dark|light)"/);
    expect(profileTsx).not.toContain('components/states"');
    for (const component of [
      "ui/Alert",
      "ui/Badge",
      "ui/Button",
      "ui/Card",
      "ui/Checkbox",
      "ui/Field",
      "ui/States",
    ]) {
      expect(profileTsx).toContain(`components/${component}`);
    }
    expect(profileTsx).toContain("QueryBlockState");
    expect(profileTsx).not.toMatch(/fb-profile__(btn|input|field|link-btn|logout)|fb-btn-primary/);
  });

  it("a leitura dos documentos legais fica numa coluna de até 65 caracteres e quebra palavra longa (sem rolagem horizontal)", () => {
    expect(profileCss).toMatch(/\.fb-legal__copy\s*\{[^}]*max-width:\s*65ch/);
    expect(profileCss).toMatch(/\.fb-legal__copy\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(profileCss).toMatch(/\.fb-flow\s*\{[^}]*max-width:\s*40rem/);
    expect(profileCss).toMatch(/\.fb-flow > \*\s*\{[^}]*min-width:\s*0/);
  });

  it("o voltar e os links dos documentos têm alvo de toque de 44px", () => {
    expect(profileCss).toMatch(/\.fb-legal__back\s*\{[^}]*min-height:\s*44px/);
    expect(profileCss).toMatch(/\.fb-legal__links a\s*\{[^}]*min-height:\s*44px/);
  });

  it("o texto legal e o do consentimento do código não mudaram", () => {
    const legal = read("pages/LegalDocumentPage.tsx");
    for (const text of [
      "Li a política de privacidade",
      "Registrar ciência",
      "Não foi possível registrar sua ciência.",
      "Ciência da política de privacidade",
      "Li e aceito os termos de uso",
      "Aceitar termos",
      "Não foi possível registrar seu aceite.",
      "Aceite dos termos de uso",
    ]) {
      expect(legal).toContain(`"${text}"`);
    }
    expect(read("pages/gamification/RankingConsentControl.tsx")).toContain(
      "Sua participação é opcional.",
    );
  });
});
