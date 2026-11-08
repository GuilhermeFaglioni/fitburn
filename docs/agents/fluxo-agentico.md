# Fluxo de desenvolvimento agêntico do Fitburn

Este é o manual de como issues com o label `ready-for-agent` viram código. Os demais arquivos de `docs/agents/` configuram as skills (tracker, labels, domínio); este descreve a operação. Os briefs prontos para cada papel estão em [`prompts/`](prompts/).

## 1. Visão geral

Issues com `ready-for-agent` são implementadas por agentes de IA. O **T3 Code** é a superfície de controle: orquestra Claude, Gemini (Antigravity) e GPT (Codex), cada um pela assinatura da própria conta. Guilherme é o **orquestrador** na sessão principal: escolhe as issues e dispara um planejador por issue. **Produto, arquitetura e tela são sempre decisão do humano.**

## 2. Papéis e modelos

| Papel | Modelo | Função |
| --- | --- | --- |
| Orquestrador | Claude Sonnet 5.5 (sessão principal) | Escolhe issues da fronteira (sem bloqueio aberto) e dispara planejadores |
| Planejador | Claude Sonnet 5.5 (thread da issue) | Lê a issue e as specs, divide em subtarefas, delega, integra, controla a revisão |
| Implementador de API, contratos e tarefas mecânicas | GPT-6 Luna via Codex; **temporariamente** Claude Haiku 5.5 | Segue `/implement` em `packages/api` e `packages/contracts` |
| Implementador de UI | Claude Sonnet 5.5 | Telas e componentes em `packages/web` |
| Revisor e dono da esteira | Gemini 4 Argon (`antigravity`, `thinking_level: medium`) | Revisa, roda a suíte, abre o PR e cuida dos checks |

Os agentes são definidos por **papel**: trocar de modelo muda só esta tabela. O revisor usa outro provedor de propósito, para ter viés diferente do implementador.

**Concorrência:** um agente por vez por padrão. A máquina tem 16 GB e cada agente pode subir Postgres, API e Vite.

## 3. Fluxo de uma issue

1. **Workspace.** Worktree Git isolada por issue, a partir de `main` (o repositório não tem `develop`), no branch `feat/<nº>-<slug>` (ou `spike/`, `chore/`, `fix/`). Copie o `.env` da checkout principal (nunca vai ao Git). Cada issue usa um banco de teste próprio no Postgres local, `fitburn_test_<nº>`, apontado por `DATABASE_URL_TEST` (o relatório de fidelidade já usa esse padrão, ex.: `fitburn_test_60`). Criação e migrations: ver seção 9.
2. **Plano.** O planejador lê `gh issue view <nº> --comments`, `GLOSSARY.md`, `docs/decisions.md`, `docs/open-decisions.md` e as specs ligadas à issue. Publica o plano como comentário: subtarefas com arquivos e critérios de aceite, e quais podem rodar em paralelo (só as que não tocam os mesmos arquivos).
3. **Implementação.** Um implementador por subtarefa. Em paralelo só se a concorrência permitir, cada um numa cópia isolada do branch da issue, com o planejador integrando os commits. Caso contrário, em sequência no próprio branch. O implementador segue `/implement` (seção 7). Mudança que cruza pacotes começa em `packages/contracts` e só então API e web.
4. **Revisão.** O revisor confere o diff contra a issue (critérios de aceite), as specs e `docs/decisions.md`, roda a suíte e publica o veredito na issue.
   - **Reprovado:** lista objetiva. O planejador repassa ao implementador, que corrige, e uma **nova** revisão é feita do zero.
   - **Aprovado:** segue para o PR.
   - Após **duas** reprovações, o planejador marca `ready-for-human` e avisa o orquestrador (número a confirmar, ver seção 10).
5. **PR e esteira.** O revisor abre o PR para `main`, título em português, corpo com `Closes #<nº>` e como validar. Ativa `gh pr merge --auto --squash --delete-branch` **logo ao abrir o PR** (sem esperar a CI: a `main` exige o check `build-and-test`, então o GitHub aguarda os checks e mergeia sozinho) e confirma com `gh pr view <nº> --json autoMergeRequest,state` que o auto-merge ficou registrado ou que o PR já mergeou. Sem `--watch` nem polling; se precisar acompanhar, use a vigilância de PR do T3 Code. Issue empilhada: o PR vai para o branch-base da issue pai. A CI roda em todo PR (`pull_request` sem filtro) e em push para `main`.
6. **Falhas na esteira.** O revisor resolve:
   - Check falhando: `gh run view --log-failed`, corrige, roda a suíte local, push.
   - Conflito com `main`: `git rebase origin/main` (ou merge, se o rebase for arriscado), roda a suíte, `git push --force-with-lease`.
   - Mudança de comportamento além de ajuste pontual volta ao passo 4.
7. **Fim.** O auto-merge entra, o `Closes` fecha a issue, o planejador avisa o orquestrador, a worktree e o banco `fitburn_test_<nº>` podem ser removidos.

## 4. Regras de ritmo

Prevalecem sobre o fluxo em caso de conflito.

- **Testes em camadas.** Durante a implementação: `pnpm typecheck` e os testes do arquivo mexido (`pnpm --filter @fitburn/api exec vitest run <arquivo>`, idem para `@fitburn/web`). A suíte completa roda **uma vez**, antes do PR; o resto fica com a CI. A suíte completa é a mesma da CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (com `@fitburn/contracts` buildado e migrations aplicadas no banco de teste).
- **Não existe E2E automatizado hoje.** Se vier a existir, roda no fim da sprint, em issue própria; feature não espera E2E.
- **Decidir com padrão.** Dúvida pequena (texto, ordem, nome): escolhe o mais simples, registra no corpo do PR e segue. `needs-info` só para decisão de produto, custo, privacidade ou arquitetura fora das specs.
- **Revisão única.** O revisor confere critérios de aceite e riscos (seção 8), sem reabrir estilo.
- **Ambiente travado não bloqueia.** Se a comparação visual ou outra ferramenta de ambiente falhar, abre issue e mergeia com a CI verde (exceto PR de UI, que sempre passa pelo humano, seção 5).

## 5. Fidelidade às telas (UI)

- **Fonte da verdade:** as decisões registradas em `docs/decisions.md` e as issues de UI (tokens, tipografia, componentes). Os artboards do Claude Design deixam de ser referência obrigatória e não entram em portão de PR.
- Toda issue de UI cita os componentes reutilizados de `packages/web/src/components` e os estados (vazio, offline, erro, carregando).
- Sem cor, raio, espaçamento ou fonte literal fora dos tokens do design system. Componente que falta entra primeiro como componente compartilhado.
- Respeitar o que já existe: motion tokens e reduced motion (`plans/`), estados offline (`OfflineBanner`, `RequiresNetwork`), foco ao navegar (`useFocusOnNavigation`).
- **Sem portão visual contra o Claude Design:** `pnpm design:compare` continua disponível como ferramenta de apoio (ver `scripts/design-compare/README.md`), mas não é exigido no PR.
- **PR de UI não usa auto-merge:** fica com `ready-for-human` até o Guilherme aprovar. API, contratos e docs seguem com auto-merge.

## 6. Como o T3 Code faz a orquestração

### Capacidades que o fluxo exige

1. Escolher o modelo de cada papel.
2. Lançar subagentes a partir do planejador.
3. Isolar subagentes paralelos numa cópia do branch da issue.
4. Acesso ao `gh` e ao shell.

Sem (2) ou (3), o planejador implementa em sequência, no branch da issue.

### Ferramentas MCP do servidor `t3-code`

| Necessidade | Ferramenta |
| --- | --- |
| Descobrir provedores e modelos | `orchestrator_capabilities` (uma vez por thread, antes da primeira delegação) |
| Subtarefa para implementador ou revisor | `delegate_task`: `target` (`providerInstanceId`, `model`, `options`), `role` (`implementation`, `review`...), `mode` (`async` ou `wait`), `runtimeMode`, `interactionMode` |
| Acompanhar ou parar | `task_status`, `task_cancel`. A conclusão do filho acorda o pai, sem polling |
| Falar com filho existente | `t3_thread_send` com `childThreadId` |
| Sessão de nível superior (uma por issue) | `t3_thread_launch` com `workspaceStrategy: worktree` e `baseRef`, ou `create_threads` (até 20) |

### Regras de operação

- **O filho recebe só o prompt da tarefa.** O histórico do pai não é copiado. O brief precisa ser autocontido e mandar ler `AGENTS.md` e este manual.
- **Cada revisão é um `delegate_task` novo**, com o brief original, os achados anteriores e as objeções abertas. Reusar o revisor com `t3_thread_send` quebra o "revisão do zero".
- **Permissão:** o filho nunca tem permissão maior que a do pai.
- **Paralelismo:** sem limite configurável. O planejador decide quantos filhos disparar, respeitando a concorrência da seção 2.
- **Worktree:** uma thread de issue nasce numa worktree a partir do `origin`. Filho paralelo isolado usa `t3_thread_launch` com `baseRef` no branch da issue.
- **Briefs prontos:** [`prompts/`](prompts/) tem `planejador.md`, `implementador-api.md`, `implementador-web.md` e `revisor.md`. Copie o modelo, preencha e passe como `task`.
- **Provedores:**
  - Antigravity lê `.agents/skills`, não reverte conversa (correção vai em mensagem ou thread nova) e usa o `/plan` nativo.
  - Claude lê `.claude/skills`.
- **Trocar de provedor numa thread** gera um resumo de contexto; não precisa recriar a thread.
- **Fora do app:** `t3 thread start|send|show|list`, com `--worktree <base-branch>` e `--wait`.

## 7. Skills relevantes

Instaladas pela CLI `skills` (registro em `skills-lock.json`), em `.agents/skills/`, com symlinks em `.claude/skills/`: `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `pr`, `to-spec`, `to-tickets`, `triage` (de `mattpocock/skills`) `codebase-map` (de `rdilruba/codebase-map`) e `impeccable` (de `pbakaus/impeccable`, instalada com `npx skills@latest add pbakaus/impeccable --skill impeccable -y`). `implement`, `implement-spec` e `tdd` (do próprio repo) ficam no mesmo lugar.

- **`implement`**: implementa a partir de spec ou tickets. Chama `tdd` nas fronteiras combinadas, roda typecheck e testes do arquivo com frequência, a suíte completa no fim, chama `code-review` e comita no branch atual.
- **`tdd`**: ciclo vermelho → verde, em fatias verticais, só em *seams* combinados antes. No Fitburn, os seams padrão são: a **API HTTP contra o banco real** (`packages/api/test`) e **componentes/páginas com Testing Library + MSW** (`packages/web/test`). Sem mock de colaborador interno.
- **`code-review`**: revisa o diff em dois eixos (padrões e spec), em sub-agentes paralelos.
- **`implement-spec`**: orquestração de uma spec inteira com subagentes e branch de integração; no fluxo atual, esse papel é do planejador por issue.
- **`pr`**, **`diagnosing-bugs`**, **`domain-modeling`**, **`codebase-design`**, **`to-spec`**, **`to-tickets`**, **`triage`**, **`codebase-map`**: apoio a PR, diagnóstico, planejamento, triagem e mapa do código.
- **`impeccable`**: qualidade visual de UI, usada pelo implementador de UI. Não substitui as decisões de design registradas em `docs/decisions.md` (seção 5).
- **`github-actions-hardening`**: prevista no fluxo, **ainda não instalada** (ver seção 10).

Configuração de issues e labels: [`issue-tracker.md`](issue-tracker.md) e [`triage-labels.md`](triage-labels.md). Domínio: [`domain.md`](domain.md); o glossário do Fitburn é o **`GLOSSARY.md`** da raiz e as decisões ficam em `docs/decisions.md` e `docs/open-decisions.md` (ainda não há `docs/adr/`).

## 8. CI e regras duras

- `.github/workflows/ci.yml` roda em PRs e em push para `main`: audit de dependências de produção (`pnpm audit --prod --audit-level=high`), build de contracts, Prisma generate, migrations no banco de teste, lint, typecheck, testes e build.
- Auto-merge só com a CI verde.
- Ninguém faz merge manual, contorna a CI ou desliga checks. Push direto em `main` é proibido.
- Segredos só no `.env` (ignorado pelo Git). Nunca em código, log, seed, print ou corpo de PR.
- **Dados de saúde e de pessoas** (LGPD): nada de dado real em testes, seeds ou prints; usar a massa de demonstração.
- **Nunca rodar `pnpm demo:reset`, seeds ou migrations destrutivas contra banco que não seja o de teste da própria issue.** O `demo:reset` apaga tudo e exige confirmação humana (ver `.env.example`). Agente não faz deploy (Coolify é do humano).
- Mudança em workflow do GitHub Actions não entra por auto-merge: `ready-for-human`.
- Decisão de produto ou arquitetura fora das specs: parar e perguntar na issue com `needs-info`.
- Comentários de issue e PRs em português.

**Riscos que o revisor sempre confere** (derivados do domínio e das auditorias em `plans/auditoria-2026-10/`): permissão e escopo por perfil (autoelevação de privilégio, acesso a dados de outro usuário); corrida em reserva e disponibilidade, e idempotência de solicitação repetida (`GLOSSARY.md`, `docs/critical-reservation.md`); ciclo de vida de sessão; consentimento e manifestações imutáveis; perda de dados; comportamento offline no PWA.

## 9. Como iniciar uma issue (passo a passo prático)

1. Confirme que a issue está com `ready-for-agent` e sem bloqueio aberto (ver "Frontier query" em [`issue-tracker.md`](issue-tracker.md)).
2. Crie a worktree e o banco da issue:

   ```bash
   git worktree add ../fitburn-w<nº> -b feat/<nº>-<slug> origin/main
   cp .env ../fitburn-w<nº>/.env
   pnpm db:up
   docker compose exec postgres createdb -U fitburn fitburn_test_<nº>
   # na worktree, ajuste DATABASE_URL_TEST no .env para fitburn_test_<nº>
   pnpm install --frozen-lockfile
   pnpm --filter @fitburn/contracts build
   pnpm prisma:generate && pnpm prisma:migrate:test
   ```

3. Lance a sessão do planejador com `t3_thread_launch` (`workspaceStrategy: worktree`), usando `prompts/planejador.md`. Se o T3 Code criar a worktree sozinho, pule o `git worktree add` e faça só o `.env`, o banco e a instalação.
4. O planejador chama `orchestrator_capabilities` e depois `delegate_task` para cada subtarefa, uma por vez.
5. Para cada revisão, `delegate_task` novo ao revisor.
6. Acompanhe a esteira. Não faça polling: a conclusão do filho acorda o pai.

## 10. Pontos de atenção e pendências

- **Número de reprovações:** adotado **duas** (seção 4 prevalece). Confirmar se é o oficial.
- **Backend temporário:** o implementador de API usa Haiku 5.5 até o GPT ser conectado via Codex; conferir o estado atual antes de delegar.
- **Skill ainda faltando:** `github-actions-hardening`. A busca com `npx skills find github-actions-hardening` não achou skill com esse nome; só aparece como proposta em `github/awesome-copilot` (PR #2002) e há alternativas de terceiros (ex.: `trebaud/skills@gha-audit`). Não instalei nenhuma sem você escolher a fonte. Até lá, mudança em workflow é sempre `ready-for-human`. As três skills locais (`implement`, `implement-spec`, `tdd`) já foram movidas para `.agents/skills/`, com symlink em `.claude/skills/`.
- **`/setup-matt-pocock-skills` não é necessário:** a skill não existe no pacote instalado, e o que ela configuraria (tracker, labels, domínio) já está em `issue-tracker.md`, `triage-labels.md` e `domain.md`.
- **Glossário:** o antigo `CONTEXT.md` foi renomeado para `GLOSSARY.md`, que é o nome que as skills (`tdd`, `diagnosing-bugs`, `domain-modeling`) procuram. Referências antigas a `CONTEXT.md` em outros documentos foram atualizadas.
- **Auto-merge:** verificado em 2026-11-06. O repositório permite auto-merge e a `main` tem branch protection exigindo o check `build-and-test` (`strict: false`, sem revisão obrigatória, `enforce_admins: true`) e apaga o branch ao mergear (`delete_branch_on_merge`). Por isso o auto-merge deve ser ativado ao abrir o PR; ativá-lo só depois de a CI ficar verde deixa o PR parado, porque o revisor encerra antes (aconteceu no PR #128). Com `enforce_admins` ligado, nem a conta do dono faz push direto na `main`: tudo passa por PR com o check verde. Se o nome do job da CI mudar, atualize o check exigido.
- **Dependência externa:** a documentação de orquestração do T3 Code (`docs/orchestration-v2/` no repositório `pingdotgg/t3code`) não está neste repo e pode mudar, por ser nightly.
- **Estado do repositório:** o `README` e `docs/decisions.md` ainda falam em app Expo e Next.js, mas o MVP em implementação é Web + PWA (`packages/web`, Vite). Os agentes devem tratar o código e o `GLOSSARY.md` como mais atuais que esses trechos.
