# Deploy do Fitburn no Coolify (VPS)

Publica o app inteiro (web + API + PostgreSQL) numa VPS com Coolify, a partir do repositório no GitHub. É a alternativa ao `docs/deploy-runbook.md` (Vercel + Nginx/Certbot manuais): aqui o Coolify cuida de HTTPS, domínio, redeploy e logs.

```
navegador ──HTTPS──► Traefik (Coolify) ──► web (Nginx :80) ──/api──► api (:3333) ──► postgres
                                              └─ serve o app (PWA)
```

- Um **único domínio** para app e API (`/api` é proxy do Nginx do `web`): o cookie de refresh funciona sem CORS.
- Arquivos: `docker-compose.coolify.yml`, `docker/web/` (Dockerfile + Nginx), `docker/api/start.sh` (migrations + seeds + API).
- A cada deploy a API aplica as migrations, garante o administrador e, com `DEMO_SEED=true`, completa a massa de demonstração (idempotente).

## 1. Pré-requisitos

1. Coolify instalado e funcionando na VPS (painel acessível, servidor "localhost" validado).
2. Um domínio/subdomínio (ex.: `fitburn.seudominio.com.br`) com registro DNS `A` apontando para o IP da VPS.
3. O repositório no GitHub conectado ao Coolify (GitHub App, ou *Deploy Key* se for privado).
4. Recomendado: 2 GB de RAM (o build do Vite e do Nest usa mais que a execução; se faltar, adicione swap).

## 2. Criar o recurso

1. **Projects → seu projeto → + New Resource → Public/Private Repository** (conforme o repo).
2. Selecione o repositório e o branch (`main`).
3. **Build Pack: `Docker Compose`**.
4. **Docker Compose Location:** `/docker-compose.coolify.yml` (base directory `/`).
5. Continue. O Coolify lê o compose e lista os serviços `postgres`, `api` e `web`.

## 3. Domínio

No recurso, abra o serviço **web** → campo **Domains** e informe, com a porta do contêiner:

```
https://fitburn.seudominio.com.br:80
```

Só o `web` recebe domínio; `api` e `postgres` não são expostos. O Coolify emite o certificado Let's Encrypt sozinho.

## 4. Variáveis de ambiente

Em **Environment Variables** do recurso (as que faltarem aparecem como obrigatórias):

| Variável | Valor |
|---|---|
| `POSTGRES_PASSWORD` | segredo forte, só letras e números: `openssl rand -hex 24` |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` (a API recusa iniciar com valor curto/de exemplo) |
| `INITIAL_ADMIN_EMAIL` | e-mail do administrador do sistema |
| `INITIAL_ADMIN_PASSWORD` | senha forte, mínimo 12 caracteres |
| `DEMO_SEED` | `true` para popular a demonstração (pode ficar `true`: é idempotente) |
| `DEMO_USER_PASSWORD` | senha de **todas** as contas de demonstração (mínimo 12 caracteres) |

Opcionais, com padrão adequado: `POSTGRES_USER`, `POSTGRES_DB`, `TZ`, `TRUST_PROXY_HOPS` (`2` = Traefik + Nginx do `web`), `AUTH_RATE_LIMIT_*`, `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`. Deixe `CORS_ALLOWED_ORIGINS` vazio.

### Rate limit de login e `X-Forwarded-For`

O Compose usa `TRUST_PROXY_HOPS=2` para a cadeia Traefik do Coolify → Nginx do `web` → API. Essa configuração só é segura se o Traefik não confiar no `X-Forwarded-For` enviado pelo cliente externo e substituir o header pelo IP real de origem. O comportamento esperado é o padrão do Traefik sem `forwardedHeaders.insecure` e sem `forwardedHeaders.trustedIPs` configurados. **A configuração do Traefik deste VPS não foi confirmada**; confirme no passo manual abaixo antes de confiar nela.

Não publique portas dos serviços `web` ou `api` fora do Traefik: só `web` deve receber domínio no Coolify, `api` não deve receber domínio, e nenhum dos dois deve declarar `ports` no Compose.

## 5. Deploy e verificação

1. Clique em **Deploy**. O primeiro build leva alguns minutos; o `api` leva ~1 min a mais para ficar saudável (migrations + seed).
2. Confira nos logs do `api` as linhas `[start] prisma migrate deploy`, `[start] seed base`, `[start] seed da demonstração` e `Fitburn API rodando`.
3. Abra `https://fitburn.seudominio.com.br/api/health` → `{"status":"ok",...}`.
4. Abra o app e entre com uma das contas abaixo.

### Headers de segurança e HSTS

O Nginx do `web` envia CSP, proteção contra framing, Referrer-Policy, nosniff e Permissions-Policy nas respostas da aplicação. O HSTS é aplicado pelo Traefik do Coolify, que termina o TLS; não configure HSTS no Nginx do `web`.

No Coolify, abra **Servers → seu servidor → Proxy → Dynamic Configurations**, adicione `fitburn-hsts.yaml` e salve:

```yaml
http:
  middlewares:
    fitburn-hsts:
      headers:
        stsSeconds: 31536000
```

Isso define `max-age=31536000` (um ano). Deixe `stsIncludeSubdomains` e `stsPreload` desativados até confirmar que todos os subdomínios e requisitos de preload estão prontos. Em seguida, no recurso Compose do Fitburn, abra **General → Container labels** e mude **Label management** para **Managed manually**. Acrescente `fitburn-hsts@file` ao valor da label existente `traefik.http.routers.https-0-<resource-id>.middlewares`, preserve os middlewares já listados e faça redeploy. O sufixo `@file` aponta para o arquivo dinâmico do Traefik.

Coolify documenta a criação de configuração dinâmica em [Dynamic configuration](https://coolify.io/docs/core/networking/proxy/traefik/dynamic-config) e a associação de middlewares em [Custom middlewares](https://coolify.io/docs/core/networking/proxy/traefik/custom-middlewares). A propriedade `stsSeconds` é definida pelo [middleware Headers do Traefik](https://doc.traefik.io/traefik/middlewares/http/headers/).

Depois do redeploy, defina `BASE_URL` como `https://<domínio>/` e confira os headers efetivos pelo HTTPS na página, no fallback da SPA e num asset inexistente (resposta 404):

```bash
BASE_URL=https://fitburn.seudominio.com.br
for path in / /rota-inexistente /assets/arquivo-inexistente.js; do
  printf '\n%s\n' "$path"
  curl -sS -D - -o /dev/null "$BASE_URL$path" \
    | grep -Ei '^(HTTP/|content-security-policy:|x-frame-options:|referrer-policy:|x-content-type-options:|permissions-policy:|strict-transport-security:)'
done
```

Cada resposta deve mostrar os cinco headers enviados pelo Nginx. `Strict-Transport-Security` deve mostrar `max-age=31536000`; confirme também no domínio HTTPS real antes de iniciar o piloto. Não use uma URL `http://` para validar HSTS.

### Verificação manual do IP usado no rate limit

Antes de usar o rate limit como proteção no VPS, confirme que um `X-Forwarded-For` forjado não cria cotas novas. Execute o teste de um único endereço externo real, contra uma stack de teste, com `AUTH_RATE_LIMIT_MAX=10` e janela de 60 segundos. Aguarde uma janela inteira sem tentativas antes de começar; use um e-mail de teste inexistente e senha errada. Envie 11 falhas de login, mudando o `X-Forwarded-For` em cada requisição:

```bash
BASE_URL=https://fitburn.seudominio.com.br
for i in $(seq 1 11); do
  status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 198.51.100.$i" \
    --data '{"email":"xff-test@fitburn.example","password":"senha-incorreta"}')
  printf '%02d %s\n' "$i" "$status"
done
```

Resultado esperado: 10 respostas de falha de autenticação seguidas por `429` na 11ª tentativa, apesar do XFF diferente em cada chamada. Se as 11 tentativas não chegarem ao `429`, não considere confirmada a configuração do Traefik; revise-a e repita o teste. Não use credenciais reais.

Daí em diante, ative **Auto Deploy** (webhook do GitHub) se quiser publicar a cada push em `main`.

## 6. Contas de demonstração

As contas de professor e cliente geradas pelo seed usam `DEMO_USER_PASSWORD`; o administrador inicial usa `INITIAL_ADMIN_PASSWORD`.

| Quem | E-mail | Perfil |
|---|---|---|
| Wilson Faglioni Junior | `wilson@fitburn.example` | Cliente (aluno) |
| Lara Faglioni | `lara@fitburn.example` | Cliente (aluno) |
| Guilherme Faglioni | `guilherme@fitburn.example` | Cliente (aluno) |
| Danielle Faglioni | `danielle@fitburn.example` | Cliente (aluno) |
| Camila Andrade, Rafael Nogueira, Aline Rocha, Marcos Pereira | `camila.andrade@`, `rafael.nogueira@`, `aline.rocha@`, `marcos.pereira@` + `fitburn.example` | Professor (fictícios) |
| Administrador | `INITIAL_ADMIN_EMAIL` (senha `INITIAL_ADMIN_PASSWORD`) | Administrador |
| 10 alunos fictícios | `marina@`, `thiago@`, `beatriz@`, `felipe@`, `camila@`, `rodrigo@`, `juliana@`, `lucas@`, `fernanda@`, `gustavo@` + `fitburn.example` | Cliente |

Os e-mails usam o domínio reservado `.example` (não recebe e-mail). Para transformar um professor em administrador, troque `role` em `packages/api/src/demo-seed/demo-data.ts` (ou crie o perfil/usuário pelo próprio app).

### O que a demonstração contém

Este é o cenário do **seed automático** (`DEMO_SEED=true`), separado da massa manual de [demo-data-checklist.md](demo-data-checklist.md), que é a base do [roteiro da demonstração](demo-script.md). O administrador vem das variáveis `INITIAL_ADMIN_*`; o seed cria quatro contas de professor e 14 contas de cliente, sem senhas fixas no repositório.

- **Uma única modalidade e aula: Personal Class** (60 min, 3 vagas), para vários professores. No mesmo horário há várias Personal Class, desde que de professores diferentes (nos horários nobres, 07h, 12h, 18h e 19h, os quatro professores atendem ao mesmo tempo). O mesmo professor nunca tem duas aulas sobrepostas.
- Agenda de 5 semanas para trás e 3 para frente (seg-sáb), com reservas, faltas, cancelamentos e algumas aulas **lotadas** nos próximos dias.
- Histórico de presença registrado pelo serviço real da API: pontos, ranking, streaks e badges consistentes. As aulas das últimas 3 horas ficam com presença **pendente** para demonstrar o registro ao vivo.
- Planos (Performance e Essencial) com histórico, clientes atribuídos a professores, metas (ativas e concluídas) e fichas de treino.

Rodar de novo (a cada deploy) é seguro: nada é duplicado, e em outro dia a agenda é completada com as datas novas. O comportamento é determinístico por cliente/dia.

## 7. Operação

- **Logs / terminal:** pelo painel do Coolify (serviço `api` → Logs / Terminal).
- **Rodar o seed manualmente:** terminal do `api` → `node packages/api/dist/demo-seed/cli.js`.
- **Reset completo da demonstração (apaga TUDO):** no terminal do `api`, `DEMO_RESET_ENABLED=true node packages/api/dist/demo-reset/cli.js --confirm-database=fitburn` (use o valor de `POSTGRES_DB`). Depois faça **Restart** do `api` (o `start.sh` refaz o seed se `DEMO_SEED=true`).
- **Backup do banco:** no Coolify, o volume `postgres_data` pode ser incluído em backups do servidor; para um dump pontual, no terminal do `postgres`: `pg_dump -U fitburn fitburn > /tmp/fitburn.sql`.
- **Voltar uma versão:** em **Deployments**, reimplante um commit anterior. Migrations não são revertidas automaticamente; uma migration nova e incompatível exige restaurar o backup.
- Para uso real (dados de verdade), troque `DEMO_SEED` para `false` e revise `docs/deploy-runbook.md`, seção "Riscos aceitos na demo".

## 8. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Deploy falha com `required variable ... is missing` | Falta cadastrar a variável obrigatória (seção 4). |
| `api` reinicia em loop | Veja o log: `JWT_ACCESS_SECRET`/senha do admin fracos, `POSTGRES_PASSWORD` com caracteres especiais (use hex), ou migration com erro. |
| App abre, mas login falha / "sessão expirada" | O domínio precisa ser HTTPS (cookie `Secure`) e o Domains do `web` deve ter a porta `:80`. |
| 502/504 no domínio | `web` espera o `api` ficar saudável; aguarde o `start_period` (~90s) ou veja os logs do `api`. |
| `DEMO_USER_PASSWORD é obrigatória` | Defina com 12+ caracteres, ou ponha `DEMO_SEED=false`. |
