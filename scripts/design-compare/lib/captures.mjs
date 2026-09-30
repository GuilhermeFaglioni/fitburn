/**
 * Mapa artboard -> tela do app, mais os estados alternativos do design.
 *
 * design.variants: estados renderizados só do lado do design (props de
 *   `data-props` e/ou cliques). Os que têm `app` também são capturados no app
 *   e comparados.
 * app: { role, route | resolve(ctx), steps } — veja lib/capture-app.mjs.
 *   role: "none" | "admin" | "professor" | "client".
 */
const RESERVA_CENARIOS = [
  "reservada",
  "sucesso",
  "erro_lotada",
  "erro_conflito",
  "erro_duplicada",
  "erro_permissao",
  "falha_remarcar",
];
const reservaVariants = RESERVA_CENARIOS.map((cenario) => ({ name: cenario, props: { cenario } }));

const LOGIN_ERROR_STEPS = [
  { fill: ['input[type="email"]', "ninguem@exemplo.com"] },
  { fill: ['input[type="password"]', "senha-errada-123"] },
  { click: "Entrar" },
  { wait: 1500 },
];

export const CAPTURES = [
  // ---- G1
  {
    id: "Login",
    group: "G1",
    app: {
      role: "none",
      route: "/login",
      variants: [{ name: "erro", steps: LOGIN_ERROR_STEPS }],
    },
    design: {
      variants: [
        { name: "erro", props: { showError: true } },
        { name: "carregando", props: { loading: true } },
      ],
    },
  },
  {
    id: "LoginMobile",
    group: "G1",
    app: {
      role: "none",
      route: "/login",
      variants: [{ name: "erro", steps: LOGIN_ERROR_STEPS }],
    },
    design: {
      variants: [
        { name: "erro", props: { showError: true } },
        { name: "carregando", props: { loading: true } },
      ],
    },
  },
  {
    id: "Cadastro",
    group: "G1",
    app: { role: "admin", route: "/clientes", steps: [{ click: "+ Novo cliente" }] },
    design: {
      variants: [
        { name: "erro_email", props: { showEmailError: true } },
        { name: "sucesso", props: { showSuccess: true } },
      ],
    },
  },
  { id: "HomeDesktop", group: "G1", app: { role: "client", route: "/" } },
  {
    id: "HomeMobile",
    group: "G1",
    app: { role: "client", route: "/" },
    design: { variants: [{ name: "sem_plano", props: { hasActivePlan: false } }] },
  },
  // ---- G2
  { id: "AgendaDesktop", group: "G2", app: { role: "client", route: "/agenda" } },
  {
    id: "AgendaMobile",
    group: "G2",
    app: { role: "client", route: "/agenda" },
    design: { variants: [{ name: "sem_aulas", props: { hasClasses: false } }] },
  },
  {
    id: "ReservaDesktop",
    group: "G2",
    // Padrão = aula disponível (a última "Treino Funcional" da semana sem reserva da Marina);
    // "reservada" = o Treino Funcional de hoje, que a Marina já reservou.
    app: {
      role: "client",
      route: "/agenda",
      steps: [{ openClass: "Treino Funcional", unreserved: true }],
      variants: [{ name: "reservada", steps: [{ openClass: "Treino Funcional", reserved: true }] }],
    },
    design: { variants: reservaVariants },
  },
  {
    id: "ReservaMobile",
    group: "G2",
    app: {
      role: "client",
      route: "/agenda",
      // Sexta-feira (5º chip de dia da semana) tem Treino Funcional sem reserva.
      steps: [{ clickSelector: ".fb-daychip:nth-child(5)" }, { openClass: "Treino Funcional" }],
      variants: [{ name: "reservada", steps: [{ openClass: "Treino Funcional", reserved: true }] }],
    },
    design: { variants: reservaVariants },
  },
  // ---- G3
  {
    id: "GamificacaoDesktop",
    group: "G3",
    app: {
      role: "client",
      route: "/gamificacao",
      variants: [{ name: "ranking_mensal", steps: [{ click: "Mensal" }] }],
    },
    design: { variants: [{ name: "ranking_mensal", steps: [{ click: "Mensal" }] }] },
  },
  {
    id: "GamificacaoMobile",
    group: "G3",
    app: {
      role: "client",
      route: "/gamificacao",
      variants: [{ name: "ranking_mensal", steps: [{ click: "Mensal" }] }],
    },
    design: { variants: [{ name: "ranking_mensal", steps: [{ click: "Mensal" }] }] },
  },
  { id: "PresencaMobile", group: "G3", app: { role: "professor", resolve: "presenca" } },
  { id: "MetasAdmin", group: "G3", app: { role: "professor", route: "/metas", steps: [{ click: "Marina Souza" }] } },
  { id: "DashboardAdmin", group: "G3", app: { role: "admin", route: "/dashboard" } },
  // ---- G4
  {
    id: "PerfilDesktop",
    group: "G4",
    app: {
      role: "client",
      route: "/perfil",
      variants: [{ name: "edicao", steps: [{ click: "Editar" }] }],
    },
    design: { variants: [{ name: "edicao", steps: [{ click: "Editar" }] }] },
  },
  {
    id: "PerfilMobile",
    group: "G4",
    app: {
      role: "client",
      route: "/perfil",
      variants: [{ name: "edicao", steps: [{ click: "Editar" }] }],
    },
    design: { variants: [{ name: "edicao", steps: [{ click: "Editar" }] }] },
  },
  {
    id: "PlanoDesktop",
    group: "G4",
    app: { role: "client", route: "/plano" },
    design: { variants: [{ name: "sem_plano", props: { hasActivePlan: false } }] },
  },
  {
    id: "PlanoMobile",
    group: "G4",
    app: { role: "client", route: "/plano" },
    design: { variants: [{ name: "sem_plano", props: { hasActivePlan: false } }] },
  },
  { id: "FichaTreinoDesktop", group: "G4", app: { role: "client", resolve: "ficha" } },
  { id: "FichaTreinoMobile", group: "G4", app: { role: "client", resolve: "ficha" } },
  // ---- G5
  {
    id: "ClientesAdmin",
    group: "G5",
    app: {
      role: "admin",
      route: "/clientes",
      variants: [{ name: "confirmar_exclusao", steps: [{ click: "Excluir" }] }],
    },
    design: { variants: [{ name: "confirmar_exclusao", props: { showDeleteConfirm: true } }] },
  },
  { id: "UsuariosPerfis", group: "G5", app: { role: "admin", route: "/usuarios" } },
  { id: "TemplatesModalidades", group: "G5", app: { role: "admin", route: "/templates-e-modalidades" } },
  { id: "AgendaAdmin", group: "G5", app: { role: "admin", route: "/agenda-administrativa" } },
  {
    id: "ReservasAdmin",
    group: "G5",
    app: { role: "admin", route: "/reservas-administrativas" },
    design: {
      variants: [
        { name: "erro_lotada", props: { cenario: "erro_lotada" } },
        { name: "erro_duplicada", props: { cenario: "erro_duplicada" } },
      ],
    },
  },
  { id: "PlanosAdmin", group: "G5", app: { role: "admin", route: "/planos" } },
  { id: "FichaTreinoAdmin", group: "G5", app: { role: "professor", route: "/fichas", steps: [{ click: "Marina Souza" }] } },
];
