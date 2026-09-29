# Runbook de deploy manual (demonstração remota)

Passo a passo para publicar o Fitburn no ambiente de demonstração: frontend na Vercel e backend (Nginx, API e PostgreSQL) numa VPS com Docker Compose. Fonte: Fase 8 (spec #9, ticket #51), `docs/mvp-web-pwa.md` (Ambientes, Segurança mínima, Reset da demonstração) e D-015 (Nginx na frente do NestJS).

O deploy automatizado (CI/CD), rollback automatizado, homologação e backups agendados estão fora de escopo. Este documento é o procedimento manual.

## Topologia

```
navegador ──► Vercel (web estática, CDN)
                 │  rewrite /api/*  →  https://DOMAIN/api/*
                 ▼
           VPS ─ Nginx :80/:443 (única entrada, HTTPS Let's Encrypt)
                 │  rede interna do Compose
                 ▼
                 API NestJS :3333 (só interna) ──► PostgreSQL :5432 (só interna, volume persistente)
```

- O Nginx é o **único** serviço que publica portas no host (80 e 443). API e PostgreSQL não têm `ports`; ficam na rede `internal`, que nem tem saída para a internet.
- Com o rewrite da Vercel, web e API ficam no mesmo site: o cookie de refresh (`HttpOnly; Secure; SameSite=Lax`) funciona sem CORS (`CORS_ALLOWED_ORIGINS` vazio).
- O acesso técnico ao banco é por `docker compose exec postgres psql ...` ou túnel SSH. Nunca por porta pública.

Arquivos: `docker-compose.prod.yml`, `docker-compose.prod.local.yml` (variante sem TLS), `docker/api/Dockerfile`, `docker/nginx/`, `.env.production.example`, `vercel.json`.

## 1. Pré-requisitos humanos

Nada disto é automatizável por agente. Faça antes do primeiro deploy (tickets #49 e #52):

1. **VPS** com Linux, acesso SSH por chave, Docker Engine e Docker Compose v2.24 ou mais novo (`docker compose version`). 1 vCPU e 2 GB de RAM bastam para a demo; o build da imagem usa mais memória que a execução (se faltar, adicione swap).
2. **Firewall da VPS** liberando entrada apenas em 22 (SSH), 80 e 443. **A porta 5432 (e a 3333) não devem ser liberadas.**
3. **Domínio ou subdomínio da API** (decisão D-031, ainda pendente) com um registro DNS `A` apontando para o IP da VPS, propagado. Exemplo: `api.seudominio.com.br`. O valor entra na variável `DOMAIN`.
4. **Projeto na Vercel** ligado ao repositório, com os segredos/variáveis que o projeto exigir cadastrados na própria Vercel (o frontend não recebe segredos: só a URL do backend, que vai no `vercel.json`).
5. Um e-mail para o Let's Encrypt e o e-mail/senha do administrador inicial da demo.

## 2. Preparar a VPS (uma vez)

```bash
ssh usuario@IP_DA_VPS
git clone https://github.com/GuilhermeFaglioni/fitburn.git
cd fitburn
git checkout main            # ou o commit/tag que será publicado
```

Crie o arquivo de ambiente a partir do exemplo e preencha **todos os campos vazios**:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32         # use para JWT_ACCESS_SECRET
openssl rand -hex 24         # use para POSTGRES_PASSWORD
$EDITOR .env.production
```

Pontos de atenção (o `.env.production.example` comenta cada variável):

| Variável | Valor |
|---|---|
| `DOMAIN` | domínio da API (ex.: `api.seudominio.com.br`) |
| `LETSENCRYPT_EMAIL` | e-mail para avisos do Let's Encrypt |
| `POSTGRES_PASSWORD` | segredo forte, só letras e números (ex.: hex) |
| `JWT_ACCESS_SECRET` | mínimo 32 caracteres; a API recusa iniciar com valor de exemplo ou curto |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | administrador da demo; senha com no mínimo 12 caracteres |
| `CORS_ALLOWED_ORIGINS` | vazio |
| `TRUST_PROXY_HOPS` | `2` (Vercel + Nginx) |

O `.env.production` **nunca** vai para o git (o `.gitignore` já o ignora). Para não repetir `-f` e `--env-file` em todo comando, exporte (vale para o restante deste runbook, na raiz do repositório):

```bash
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.production
docker compose config --quiet     # valida o arquivo: falha listando o que faltar
```

## 3. Build e envio da imagem

A API e as migrations usam a **mesma imagem** (`fitburn-api`), construída a partir do monorepo pnpm (`docker/api/Dockerfile`).

**Opção A (recomendada): construir na VPS.**

```bash
docker compose build
```

**Opção B: construir no seu computador e enviar** (VPS pequena demais para o build):

```bash
# no seu computador, na raiz do repositório
docker build -f docker/api/Dockerfile -t fitburn-api:latest .
docker save fitburn-api:latest | gzip | ssh usuario@IP_DA_VPS 'gunzip | docker load'
# na VPS, use --no-build nos comandos "up" e "run" abaixo
```

Para poder voltar a uma versão anterior, use uma tag por deploy (`IMAGE_TAG=2026-09-30` no `.env.production`) e guarde a anterior.

## 4. Migrations (passo dedicado, antes de a API subir)

O serviço `migrate` roda `pnpm --filter @fitburn/api exec prisma migrate deploy` e termina. A API só sobe depois que ele conclui com sucesso (`depends_on: service_completed_successfully`), mas rode-o explicitamente para ver o resultado e interromper o deploy se falhar:

```bash
docker compose up -d postgres          # sobe o banco e espera ficar saudável
docker compose run --rm migrate        # aplica as migrations pendentes
```

Se falhar, **não continue**: a versão antiga da API segue no ar (nada foi reiniciado). Corrija e rode de novo; `migrate deploy` é idempotente.

## 5. Primeira emissão do certificado HTTPS (só no primeiro deploy)

O Nginx escolhe a configuração pelo estado do certificado: sem certificado, sobe em modo `bootstrap` (só a porta 80, servindo o desafio do Let's Encrypt); com certificado, sobe em HTTPS.

```bash
set -a; . ./.env.production; set +a     # carrega DOMAIN e LETSENCRYPT_EMAIL neste shell
docker compose up -d nginx              # modo bootstrap (sobe a API junto, se preciso)
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email
docker compose restart nginx            # agora com certificado: passa para HTTPS
```

Falhou? Confira se o DNS de `DOMAIN` já aponta para a VPS e se a porta 80 está liberada no firewall. Para testar sem gastar o limite de emissões, acrescente `--staging` ao `certbot certonly` (depois apague com `docker volume rm fitburn-prod_letsencrypt` e emita o certificado real).

**Renovação automática:** o serviço `certbot` roda em segundo plano e tenta `certbot renew` a cada 12 horas (renova só o que vence em menos de 30 dias, pelo mesmo método webroot); o Nginx recarrega a configuração a cada 6 horas para pegar o certificado novo. Nada a fazer; para conferir: `docker compose run --rm --entrypoint certbot certbot renew --dry-run`.

## 6. Subir a stack

```bash
docker compose up -d
docker compose ps
```

Esperado: `postgres` e `api` como `healthy`, `migrate` como `Exited (0)`, `nginx` e `certbot` como `running`. Os dados do PostgreSQL ficam no volume `fitburn-prod_postgres_data` e sobrevivem a `restart`, `down` e recriação de contêineres (só `down -v` os apaga; **nunca use `-v` na VPS**).

## 7. Verificação de saúde

```bash
curl -fsS https://DOMAIN/api/health
# {"status":"ok","database":"connected","timestamp":"..."}
```

`status: "ok"` e `database: "connected"` confirmam API no ar e banco alcançável. (Atenção: o endpoint responde HTTP 200 mesmo com o banco fora; confira o corpo, não só o código.) Se a API não subiu, `docker compose logs api` mostra o motivo: com configuração de produção inválida ela imprime a lista de variáveis faltando e sai.

## 8. Frontend na Vercel

1. Em `vercel.json`, troque o placeholder `api.fitburn.example` pelo `DOMAIN` real (o arquivo não lê variáveis de ambiente):

   ```json
   { "source": "/api/:path*", "destination": "https://api.seudominio.com.br/api/:path*" }
   ```

2. Faça commit e push. Na Vercel, o projeto usa a raiz do repositório como *Root Directory* e Node 20 ou mais novo; instalação, build e saída já estão no `vercel.json` (`pnpm --filter @fitburn/contracts build && pnpm --filter @fitburn/web build`, saída em `packages/web/dist`). O segundo rewrite (`/(.*)` → `/index.html`) faz as rotas do app funcionarem ao recarregar a página.
3. Aguarde o deploy e abra a URL da Vercel.

## 9. Reset da demonstração

O reset é um comando técnico (ticket #50), fora da interface e sem endpoint HTTP: limpa os dados, roda migrations e seeds, recria o administrador inicial e restaura as regras de gamificação e as configurações. Só roda com a flag de ambiente de demonstração ativa e com confirmação explícita, para nunca apagar um banco errado.

Na VPS, dentro do contêiner da API (a imagem inclui o pnpm e o script):

```bash
docker compose exec api pnpm demo:reset
```

O comando informa a flag de ambiente e a confirmação que exige; passe-as conforme a documentação do #50 (por exemplo, `docker compose exec -e NOME_DA_FLAG=... api pnpm demo:reset ...`). Depois do reset só existem o administrador inicial, os perfis de sistema e as configurações; o administrador cadastra o resto manualmente. Rodar o reset duas vezes seguidas produz o mesmo estado.

## 10. Checklist de verificação remota (após o primeiro deploy e a cada deploy)

Use a URL da Vercel (`APP`) e o domínio da API (`DOMAIN`).

- [ ] **HTTPS válido:** `curl -sSI https://DOMAIN/api/health` responde sem erro de certificado (sem `-k`). `openssl s_client -connect DOMAIN:443 -servername DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates` mostra emissor Let's Encrypt e validade futura. `curl -sI http://DOMAIN/` responde `301` para `https://`.
- [ ] **Saúde:** `curl -fsS https://DOMAIN/api/health` e `curl -fsS https://APP/api/health` (pelo rewrite da Vercel) devolvem `"status":"ok"`.
- [ ] **Login e refresh via Vercel:** abra `APP`, entre com o administrador; no DevTools (Application, Cookies) o cookie `fitburn_refresh_token` aparece com `HttpOnly`, `Secure` e `SameSite=Lax`. Recarregue a página: a sessão continua (o refresh funcionou). Por linha de comando:
  ```bash
  curl -si -X POST https://APP/api/auth/login -H 'Content-Type: application/json' \
    -d '{"email":"ADMIN_EMAIL","password":"ADMIN_SENHA"}'      # 201/200 + Set-Cookie
  ```
- [ ] **PostgreSQL inacessível pela internet:** de **fora** da VPS (seu computador, não a VPS), `nmap -Pn -p 5432,3333 IP_DA_VPS` (ou `nc -zv -w5 IP_DA_VPS 5432`) mostra as portas `closed` ou `filtered`. Na VPS, `docker compose ps` não mostra `0.0.0.0:5432` e `ss -ltn | grep -c ':5432'` dá `0`.
- [ ] **Só Nginx publica portas:** `docker compose ps --format '{{.Service}} {{.Ports}}'` mostra portas publicadas apenas em `nginx` (80 e 443).
- [ ] **PWA instalável:** em `APP` no Chrome, DevTools, Application, Manifest mostra o app sem erros e o ícone de instalar aparece na barra de endereço (no celular, "Instalar app" / "Adicionar à tela inicial"). Depois de um novo deploy, o app exibe "Nova versão disponível".
- [ ] **Renovação do certificado:** `docker compose run --rm --entrypoint certbot certbot renew --dry-run` termina com sucesso.
- [ ] **Reset remoto:** `docker compose exec api pnpm demo:reset` (seção 9) conclui com sucesso e o login do administrador inicial funciona depois.

## 11. Deploys seguintes (rotina)

```bash
ssh usuario@IP_DA_VPS && cd fitburn
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.production
git fetch && git checkout main && git pull --ff-only     # ou o commit/tag desejado
docker compose build                                     # 1. build
docker compose up -d postgres
docker compose run --rm migrate                          # 2. migrations (pare aqui se falhar)
docker compose up -d                                     # 3. restart da API com a nova imagem
curl -fsS https://DOMAIN/api/health                      # 4. verificação de saúde
```

A janela sem API é de alguns segundos (recriação do contêiner). O frontend é publicado pela Vercel a cada push; se o deploy mudou o contrato da API, publique backend antes do frontend.

## 12. Operação

- **Logs:** `docker compose logs -f api` (ou `nginx`, `postgres`); rotacionam sozinhos (3 arquivos de 10 MB).
- **Acesso técnico ao banco:** `docker compose exec postgres psql -U fitburn -d fitburn` (ou túnel SSH para uma porta local que você abre e fecha; o banco continua sem porta pública).
- **Backup manual** (não há backup agendado): `docker compose exec -T postgres pg_dump -U fitburn fitburn | gzip > fitburn-$(date +%F).sql.gz`.
- **Voltar uma versão (manual):** `git checkout <commit anterior>`, `IMAGE_TAG=<tag anterior> docker compose up -d`. Migrations já aplicadas **não** são desfeitas; se a migration nova for incompatível com a versão antiga, restaure o backup.
- **Parar tudo sem perder dados:** `docker compose down` (sem `-v`).

## 13. Verificação local do Compose de produção (sem TLS)

Permite conferir a stack inteira (Nginx, API na porta interna, PostgreSQL sem porta publicada, migrations em passo dedicado) na sua máquina, sem VPS, domínio nem certificado. Usa `docker-compose.prod.local.yml`, que troca o Nginx para HTTP puro na porta 8080 e desliga o certbot.

```bash
cp .env.production.example .env.production
# Preencha os obrigatórios com valores de teste, e ajuste:
#   DOMAIN=localhost            (só satisfaz a variável obrigatória)
#   TRUST_PROXY_HOPS=1          (sem Vercel na frente)
# Ex.: POSTGRES_PASSWORD=$(openssl rand -hex 16), JWT_ACCESS_SECRET=$(openssl rand -hex 32),
#      INITIAL_ADMIN_EMAIL=admin@fitburn.local, INITIAL_ADMIN_PASSWORD=uma-senha-forte-123

export COMPOSE_FILE=docker-compose.prod.yml:docker-compose.prod.local.yml COMPOSE_ENV_FILES=.env.production
docker compose config --quiet            # sintaxe e variáveis obrigatórias
docker compose up -d --build             # build, postgres, migrate, api, nginx
docker compose ps                        # migrate: Exited (0); postgres e api: healthy
```

Verificações:

```bash
curl -i http://localhost:8080/api/health           # 200, {"status":"ok","database":"connected",...}
curl -i http://localhost:8080/                     # 404 (o Nginx só encaminha /api/)
docker compose ps --format '{{.Service}} {{.Ports}}'   # só nginx com porta (8080->80)
nc -zv -w2 localhost 5432 || echo "5432 fechada (esperado)"
nc -zv -w2 localhost 3333 || echo "3333 fechada (esperado)"

# Login e refresh (o cookie é Secure; por isso o refresh é enviado no header Cookie):
docker compose exec api pnpm --filter @fitburn/api prisma:seed       # cria o administrador inicial
REFRESH=$(curl -si -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@fitburn.local","password":"uma-senha-forte-123"}' \
  | sed -n 's/^[Ss]et-[Cc]ookie: fitburn_refresh_token=\([^;]*\).*/\1/p')
curl -si -X POST http://localhost:8080/api/auth/refresh -H "Cookie: fitburn_refresh_token=$REFRESH"   # 200
```

Para desmontar: `docker compose down` (mantém o volume) ou `docker compose down -v` (apaga também os dados de teste, só na sua máquina).

## 14. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `docker compose config` reclama de variável obrigatória | Campo vazio no `.env.production` |
| API sai logo ao subir, log lista variáveis | Configuração de produção inválida (segredo ausente, de exemplo ou curto); corrija o `.env.production` |
| `migrate` falha | Banco fora, senha do `.env.production` diferente da que criou o volume (o volume guarda a senha da primeira subida), ou migration com erro |
| Nginx reinicia em loop após emitir certificado | `DOMAIN` diferente do usado no `certbot`; veja `docker compose logs nginx` |
| 502 do Nginx logo após um deploy | API ainda subindo; aguarde o `healthy` e tente de novo |
| Login bloqueado (429) | Rate limit por IP; se todos os usuários caem no mesmo IP, confira `TRUST_PROXY_HOPS` (2 atrás da Vercel) |
