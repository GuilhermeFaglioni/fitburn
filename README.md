# System Design — App da Academia

[![CI](https://github.com/GuilhermeFaglioni/fitburn/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilhermeFaglioni/fitburn/actions/workflows/ci.yml)

Documentação do desenho de alto nível para substituir o aplicativo white-label por uma plataforma própria.

## Estado atual

O MVP Web + PWA está em implementação, por fases, seguindo o roteiro registrado nas issues do GitHub (specs e tickets, uma por fase/ticket). Modelo de dados completo, observabilidade e configuração fina de infraestrutura de produção ainda não foram definidos.

## Como rodar localmente

Pré-requisitos: Node 20+, pnpm, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up                          # sobe o PostgreSQL (bancos fitburn_dev e fitburn_test)
pnpm --filter @fitburn/contracts build
pnpm prisma:migrate                 # aplica migrations no banco de desenvolvimento
pnpm prisma:migrate:test            # aplica migrations no banco de teste

pnpm dev:api                        # API em http://localhost:3333/api
pnpm dev:web                        # Web em http://localhost:5173 (proxy /api -> :3333)
```

Outros comandos úteis:

```bash
pnpm typecheck   # typecheck de todos os pacotes
pnpm test        # suíte completa (api + web)
pnpm test:api    # só a API (Vitest, seam HTTP contra o banco real)
pnpm test:web    # só a web (Vitest, Testing Library + MSW)
pnpm build       # build de produção de todos os pacotes
pnpm db:down     # derruba o PostgreSQL local
```

O monorepo (`packages/contracts`, `packages/api`, `packages/web`) é gerenciado com pnpm workspaces — ver `pnpm-workspace.yaml`.

## Documentos

- [Arquitetura geral](docs/architecture-overview.md)
- [Decisões registradas](docs/decisions.md)
- [Requisitos e restrições](docs/requirements.md)
- [Reserva de aula](docs/critical-reservation.md)
- [Pendências e decisões futuras](docs/open-decisions.md)
- [Vocabulário do domínio](CONTEXT.md)

## Stack definida até agora

```text
Mobile:       Expo
Backend:      NestJS + TypeScript
ORM:          Prisma
Banco:        PostgreSQL
Hospedagem:   Amazon RDS for PostgreSQL
Compute:      Amazon EC2
Proxy:        Nginx
Fila:         Amazon SQS
Agendamento:  EventBridge Scheduler
Cache:        adiado
```

## Status das decisões

- **Aprovado**: decidido na conversa.
- **No desenho**: incluído na arquitetura de alto nível, mas ainda sem detalhamento ou ratificação específica.
- **Pendente**: precisa de decisão futura.
