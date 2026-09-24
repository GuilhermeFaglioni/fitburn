# System Design — App da Academia

Documentação do desenho de alto nível para substituir o aplicativo white-label por uma plataforma própria.

## Estado atual

Escopo: system design de alto nível. Modelo de dados, padrões de projeto, detalhes de implementação, observabilidade e configuração fina de infraestrutura ainda não foram definidos.

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
