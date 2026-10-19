# 005 — Infra: dependências vulneráveis, guarda do deploy Vercel e X-Forwarded-For

- **Status**: TODO
- **Commit**: —
- **Severity**: MEDIUM
- **Origem**: auditoria contracts-infra (dependências; placeholder Vercel) e api-security M4 (rate limit contornável por `X-Forwarded-For`)
- **Escopo estimado**: `package.json`, `pnpm-lock.yaml`, `packages/*/package.json`, `vercel.json`, `.github/workflows/ci.yml`, `scripts/deploy-check.mjs`, `docker/`, `docker-compose.prod.yml`, `docs/deploy-runbook.md`, `docs/deploy-coolify.md`
- **Ambiente**: siga `plans/auditoria-2026-10/_ambiente.md` com slug `p005` (use `pnpm install` **sem** `--frozen-lockfile`, porque o lockfile vai mudar)

## Problema

1. **Dependências.** `pnpm audit` acusa 7 advisories (4 high: `lodash` code injection, `deepmerge-ts` stack exhaustion, `mysql2` credential leak, `source-map-js` DoS; 3 moderate em `lodash`/`mysql2`), todos transitivos, a maioria via Prisma CLI/Studio. O `docker/api/Dockerfile` instala dependências sem `--prod`, então eles vão para a imagem de runtime.
2. **Vercel com placeholder.** `vercel.json:9-10` reescreve `/api/*` para `https://api.fitburn.example`. `scripts/deploy-check.mjs --strict` detecta isso, mas nada o executa automaticamente; um deploy Vercel sai "verde" e quebra login/API. O domínio real não está no repositório.
3. **Rate limit de login contornável.** `configure-app.ts` usa `trust proxy = TRUST_PROXY_HOPS` (2 no compose Vercel+Nginx, `docker-compose.prod.yml:~36-38`). Quem chama a API direto (sem Vercel) com `X-Forwarded-For` forjado ganha cota nova a cada valor. `docs/deploy-runbook.md:~225-227` já descreve o risco e a mitigação, aceitando-o só para demo.

## Alvo

1. Zerar os advisories **high** (e os moderate se der sem quebrar): atualizar Prisma/transitivos para versões corrigidas ou usar `pnpm.overrides` compatíveis no `package.json` raiz. Rodar `pnpm audit --prod` e `pnpm audit` antes/depois e registrar o resultado no corpo do commit. Adicionar à CI um passo `pnpm audit --prod --audit-level=high`. Se algum advisory não tiver correção disponível, não force: documente e use `--ignore`/exceção explícita apenas para ele, com comentário.
2. Guarda do Vercel sem precisar do domínio real: fazer o deploy Vercel **falhar** enquanto o placeholder existir — por exemplo, prefixar o `buildCommand` de `vercel.json` com `node scripts/deploy-check.mjs --strict &&` (confirme que o script roda sem dependências extras no ambiente de build da Vercel e que não exige variáveis que só existem na VPS; se exigir, crie um modo/flag que cheque só o `vercel.json`). **Não** adicionar o `--strict` à CI geral (falharia sempre até o domínio existir). Atualizar `docs/deploy-runbook.md` dizendo que o build da Vercel agora falha com placeholder.
3. X-Forwarded-For: implementar a mitigação **descrita no runbook** na parte que está no repositório. Leia `docs/deploy-runbook.md` (seção do risco), `docs/deploy-coolify.md`, `docker-compose.prod.yml`, `docker-compose.coolify.yml` e a config do Nginx em `docker/`. Para cada topologia (Coolify: proxy único do Coolify/Traefik; Vercel+Nginx: dois saltos), garanta que um cliente não consegue escolher o próprio `req.ip`: no Coolify, confirme que `TRUST_PROXY_HOPS` é 1 e que o proxy sobrescreve/anexa corretamente; no Vercel+Nginx, a mitigação típica é o Nginx aceitar `/api` apenas de origem confiável ou só confiar no `X-Forwarded-For` quando a requisição vier da Vercel (ex.: `set_real_ip_from`/`real_ip_header` com faixas da Vercel, ou um header secreto compartilhado). Se a mitigação depender de configuração fora do repo (painel da Vercel, firewall), implemente o que couber aqui, documente o passo manual no runbook e diga isso no relatório. Adicione/ajuste testes de artefato de deploy existentes (`packages/api/test/deploy-artifacts.spec.ts`) se eles validarem esses arquivos.

## Passos

1. Rode `pnpm audit` e `pnpm why <pacote>` para cada advisory; atualize/override; `pnpm install`; rode `pnpm typecheck`, `pnpm test` (API com banco `fitburn_test_p005`, web) e `pnpm build` para garantir que a atualização não quebrou nada (preste atenção às gotchas de Prisma 7 + adapter-pg).
2. Implemente a guarda do Vercel; rode `node scripts/deploy-check.mjs --strict` localmente e confirme a falha esperada com placeholder e o sucesso quando trocado (teste num arquivo temporário fora do repo, não deixe o domínio trocado).
3. Implemente a mitigação de XFF e atualize os docs de deploy.
4. CI: adicione o passo de audit em `.github/workflows/ci.yml`.

## Boundaries

- Não suba versão major de NestJS/React/Vite nem de dependências diretas sem necessidade de segurança.
- Não altere `.env*` reais; `.env.example`/`.env.production.example` só se uma variável nova for necessária (documentada).
- Não faça deploy, não acesse a VPS, Vercel ou Coolify.

## Aceitação

- `pnpm audit --prod --audit-level=high` passa; typecheck, testes e build verdes.
- Build Vercel falha com placeholder (comprovado localmente pelo comando do `buildCommand`).
- Docs de deploy descrevem a mitigação de XFF e o que for manual.
- Commits separados por tema, ex.: `fix(deps): atualiza dependências com advisories`, `fix(deploy): falha o build da Vercel com destino placeholder`, `fix(deploy): impede IP forjado por X-Forwarded-For no rate limit`.
