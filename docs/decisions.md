# Decisões de system design

Registro das decisões tomadas durante a conversa. O documento separa decisões aprovadas de elementos apenas presentes no desenho.

## Stack e aplicação

| ID | Decisão | Status | Motivo principal |
|---|---|---|---|
| D-001 | App mobile com Expo | Aprovado | Código compartilhado para iOS e Android, com possibilidade de módulos nativos quando necessário. |
| D-002 | Backend com NestJS + TypeScript | Aprovado | Estrutura adequada para o domínio e mesma linguagem dos frontends principais. |
| D-003 | ORM Prisma | Aprovado | Preferência por produtividade, tipagem e migrations integradas. |
| D-004 | Painel web com Next.js + TypeScript | No desenho | Foi a recomendação para o painel web; ainda não houve ratificação específica posterior. |
| D-005 | Painel administrativo mobile baseado em Expo | No desenho | Requisito inclui painel mobile; ainda falta decidir se será o mesmo app ou um app separado. |

## Dados e processamento

| ID | Decisão | Status | Motivo principal |
|---|---|---|---|
| D-006 | PostgreSQL | Aprovado | Modelo relacional adequado para agenda, reservas, planos, permissões e históricos. |
| D-007 | Amazon RDS for PostgreSQL | Aprovado | Banco gerenciado, mantendo PostgreSQL padrão e reduzindo operação de infraestrutura. |
| D-008 | Aurora PostgreSQL fora da primeira versão | Aprovado | Recursos adicionais não são necessários para o volume inicial. |
| D-009 | Amazon SQS para processamento assíncrono | Aprovado | Fila para notificações e futuras integrações sem bloquear a API. |
| D-010 | EventBridge Scheduler para lembretes | Aprovado | Agendamento de eventos únicos ou recorrentes antes da publicação na SQS. |
| D-011 | Cache adiado | Aprovado | Volume inicial não justifica Redis/Valkey e a disponibilidade de vagas não deve depender de cache. |
| D-012 | S3 para arquivos | No desenho | Previsto para arquivos, mas o escopo obrigatório e a política de armazenamento ainda não foram detalhados. |

## Compute e rede

| ID | Decisão | Status | Motivo principal |
|---|---|---|---|
| D-013 | NestJS rodando em EC2 | Aprovado | Controle do ambiente e prática de conceitos AWS/SAA. |
| D-014 | EC2 em subnet pública | Aprovado | Sem Load Balancer inicialmente e com entrada direta na API através do Nginx. |
| D-015 | Nginx na frente do NestJS | Aprovado | Reverse proxy, entrada HTTPS e isolamento da porta interna da API. |
| D-016 | RDS em subnets privadas | Aprovado | Banco sem acesso direto da internet. |
| D-017 | VPC com 2 Availability Zones | Aprovado | Preparação para resiliência futura do banco e da rede. |
| D-018 | Uma subnet pública para EC2 e duas privadas para RDS | Aprovado | Topologia mínima aprovada para o início. |
| D-019 | Sem NAT Gateway inicialmente | Aprovado | EC2 pública possui saída direta e o NAT adicionaria custo sem necessidade atual. |
| D-020 | Sem Load Balancer inicialmente | Aprovado | Volume inicial baixo e preferência por começar com menos componentes. |
| D-021 | Systems Manager para administrar EC2 | No desenho | Preferência registrada para evitar SSH aberto; detalhes ficaram para depois. |

## Identidade e acesso

| ID | Decisão | Status | Motivo principal |
|---|---|---|---|
| D-022 | Autenticação própria no NestJS | Aprovado | Controle dos módulos e das regras pelo backend próprio. |
| D-023 | Login com e-mail e senha | Aprovado | Método escolhido para clientes, professores e funcionários. |
| D-024 | JWT access token + refresh token | Aprovado | Modelo de sessão escolhido para mobile e web. |
| D-025 | Biometria como mecanismo local | Aprovado | Face ID, Touch ID ou impressão digital desbloqueiam o app; não substituem a autenticação do backend. |
| D-026 | Papéis e permissões diferenciados | Requisito aprovado; detalhes pendentes | Professores e outros funcionários possuem acessos diferentes; matriz de autorização ainda não foi definida. |

## Wearables e negócio

| ID | Decisão | Status | Motivo principal |
|---|---|---|---|
| D-027 | Não criar app próprio para Apple Watch | Aprovado | O objetivo é apenas consultar dados, se possível. |
| D-028 | Avaliar HealthKit e Health Connect | Aprovado | Caminhos nativos para dados do Apple Watch e dispositivos Android. |
| D-029 | Não haverá venda dentro do app | Aprovado | Podem existir consultas, inputs, automações e integrações financeiras. |
| D-030 | Uma filial e poucos clientes no início | Requisito aprovado | Permite começar com robustez operacional proporcional ao cenário, preservando evolução futura. |
| D-031 | Domínio não será definido agora | Pendente | Não bloqueia o desenho de componentes. |

## Reserva de aula

| ID | Decisão | Status | Motivo principal |
|---|---|---|---|
| D-032 | Reserva é operação transacional | Aprovado | Evitar inconsistência entre disponibilidade e confirmação. |
| D-033 | Reserva é idempotente | Aprovado | Repetição da mesma solicitação não pode criar duas reservas. |
| D-034 | Backend não confia no estado do frontend | Aprovado | O backend sempre revalida vagas, conflitos e elegibilidade. |
| D-035 | Estado desatualizado é recusado com erro correto | Aprovado | O cliente precisa atualizar a tela e informar o motivo real ao usuário. |
| D-036 | Notificação é posterior à confirmação | Aprovado | Falha no push não desfaz uma reserva confirmada. |

## Regra de mudança

Decisões marcadas como “No desenho” não devem ser tratadas como definitivas até serem ratificadas. Decisões aprovadas podem ganhar detalhamento posterior sem alterar sua direção, salvo nova decisão explícita.

## Alternativas discutidas

### Mobile

- React Native sem Expo: oferece controle nativo direto, mas aumenta a manutenção de Xcode, Gradle, CocoaPods e dependências.
- Flutter: alternativa multiplataforma válida, mas introduziria Dart e outro ecossistema.
- Kotlin Multiplatform: alternativa para compartilhar lógica ou UI com Kotlin, mas adicionaria complexidade e não foi priorizada.
- Swift + Kotlin nativos: máximo controle por plataforma, porém exigiria duas bases de código.

Expo foi escolhido porque atende o app iOS/Android e permite adicionar módulos nativos caso HealthKit, Health Connect ou outras integrações exijam isso. Não haverá app próprio para Apple Watch.

### Backend HTTP

- Express: mais minimalista e livre, mas deixaria a organização de módulos, validações e permissões totalmente sob responsabilidade do projeto.
- Fastify: menor overhead, mas não há necessidade de otimizar esse ponto para o volume inicial.

NestJS foi escolhido como framework de aplicação. Ele pode usar Express ou Fastify por baixo; a escolha atual não exige detalhar o adapter HTTP.

### ORM

- Drizzle: mais próximo de SQL e com maior controle explícito.
- TypeORM: alternativa tradicional no ecossistema NestJS.
- MikroORM: ORM mais completo, mas com maior curva de aprendizado.

Prisma foi escolhido por produtividade, tipagem, migrations integradas e experiência de desenvolvimento solo.

### Banco e execução

- Supabase como plataforma completa: não escolhido por preferência de controle dos módulos.
- Supabase apenas como host PostgreSQL: possível, mas não necessário.
- Aurora PostgreSQL: não escolhido para a primeira versão por complexidade e recursos acima da necessidade inicial.
- RDS PostgreSQL: escolhido como PostgreSQL gerenciado padrão.
- ECS/Fargate e App Runner: alternativas para execução gerenciada do backend, adiadas em favor de EC2 para manter controle e praticar AWS/SAA.

### Rede e entrada da aplicação

- EC2 privada com Load Balancer: arquitetura futura possível, mas adiada.
- EC2 pública sem proxy: funcionaria, mas Nginx foi escolhido para separar entrada HTTPS e aplicação.
- RDS público: não escolhido; o RDS será privado.
