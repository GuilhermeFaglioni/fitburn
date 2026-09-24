# Requisitos e restrições

## Objetivo do produto

Substituir o aplicativo white-label atual por um app próprio, melhorando as funcionalidades existentes, permitindo novas funcionalidades e usando gamificação para aumentar o engajamento dos clientes.

## Funcionalidades existentes

- agenda de aulas;
- plano ativo;
- histórico de planos;
- remarcação pontual de aulas;
- dados pessoais do perfil.

## Funcionalidades e capacidades novas

- app próprio para clientes;
- painel administrativo web;
- painel administrativo mobile;
- acessos diferentes para professores e outros funcionários;
- notificações;
- gamificação;
- possibilidade de integrações futuras;
- possível leitura de dados de Apple Watch e outros wearables;
- biometria no app.

## Contexto operacional

- uma filial no início;
- academia focada em aulas personalizadas;
- poucos clientes;
- horários frequentemente lotados;
- uso de espaço exclusivo;
- sobreposição de horários não pode ocorrer;
- robustez extrema não é necessária na primeira versão;
- estrutura deve permitir crescimento futuro.

## Requisitos críticos de agenda

A reserva precisa:

- ser processada no backend;
- ocorrer como operação transacional;
- ser idempotente;
- revalidar disponibilidade no momento da confirmação;
- recusar solicitações quando o frontend estiver dessincronizado;
- retornar erro semanticamente correto;
- impedir sobreposição e excesso de capacidade;
- publicar notificações somente depois da confirmação.

O frontend pode exibir disponibilidade para orientar o usuário, mas nunca pode ser considerado fonte de verdade.

## Requisitos de autenticação

- autenticação própria no NestJS;
- login por e-mail e senha;
- JWT access token e refresh token;
- diferenciação de acesso por perfil;
- biometria como desbloqueio local do app.

Validade, rotação, revogação, armazenamento e matriz detalhada de permissões permanecem pendentes.

## Dados de saúde

O app pode consultar dados por:

- HealthKit no iOS;
- Health Connect no Android.

Não haverá aplicativo próprio para Apple Watch nesta fase. A seleção dos dados, consentimentos, retenção e uso na gamificação ainda precisam ser definidos.

## Financeiro

Não haverá vendas ou checkout dentro do app. O sistema poderá, no futuro, receber inputs, executar automações ou consultar integrações para exibir informações financeiras.

## Fora do escopo atual

Não fazem parte desta etapa de system design de alto nível:

- modelagem de tabelas e entidades;
- definição de banco além da direção PostgreSQL/RDS;
- filas além da decisão de alto nível de usar SQS;
- caching detalhado;
- observabilidade;
- design patterns;
- contratos completos de API;
- matriz detalhada de autorização;
- configuração fina de IAM e Security Groups;
- domínio e certificados;
- pipeline de deploy;
- alta disponibilidade completa da aplicação.
