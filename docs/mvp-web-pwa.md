# MVP Web + PWA

## Status

Definição aprovada para o protótipo funcional demonstrável.

## Objetivo

Criar um protótipo funcional para demonstrar a substituição do aplicativo white-label por uma plataforma própria para uma academia de aulas personalizadas.

O objetivo principal não é operar a academia em produção. É permitir que um decisor avalie o produto e autorize um piloto real.

O critério principal de sucesso é o decisor aprovar o início de um piloto real.

## Estratégia do MVP

O MVP será um vertical slice funcional, com frontend React/PWA, backend NestJS e PostgreSQL real.

O sistema terá dados fictícios inicialmente. O uso de dados reais ficará restrito a um piloto posterior, depois da aplicação dos requisitos mínimos de segurança definidos neste documento.

Não haverá implementação nativa para iOS ou Android nesta etapa. O futuro app Expo consumirá a mesma API e reutilizará as regras de negócio do backend.

## Público da demonstração

O MVP será demonstrado para um decisor da academia.

O primeiro teste será feito pela equipe, sem clientes reais realizando reservas.

Perfis necessários na aplicação:

- administrador;
- professor;
- funcionário administrativo;
- cliente simulado.

O sistema começa com os perfis Administrador e Cliente. O administrador poderá criar os demais perfis e definir suas permissões.

## Experiência da aplicação

Haverá uma única aplicação web responsiva, acessível em desktop e mobile.

Depois do login, a navegação será definida pelo perfil e pelas permissões do usuário:

- cliente: resumo pessoal, agenda, reservas, plano, ficha e gamificação;
- equipe: dashboard administrativo, agenda, clientes, reservas, presença, fichas e gamificação, conforme as permissões concedidas.

O visual deve se aproximar de um produto final: interface limpa, consistente, responsiva e com identidade visual coerente. Não será um wireframe descartável.

## Escopo funcional do cliente

### Autenticação

- login por e-mail e senha;
- logout;
- access token e refresh token;
- sem cadastro público;
- sem recuperação de senha no MVP.

### Agenda e aulas

O cliente poderá:

- visualizar a agenda;
- visualizar as vagas disponíveis;
- visualizar detalhes da aula;
- visualizar aulas futuras e passadas relevantes ao seu contexto.

### Reservas

O cliente poderá:

- reservar uma aula;
- cancelar uma reserva;
- remarcar uma reserva;
- consultar o estado da reserva.

A reserva será confirmada automaticamente pelo backend quando as regras forem atendidas.

Não haverá aprovação manual para concluir uma reserva.

### Plano

O cliente poderá visualizar:

- plano ativo;
- nome;
- descrição;
- data de início;
- data de fim;
- status;
- histórico de planos.

O plano será informativo no MVP. Não bloqueará reservas por elegibilidade ou quantidade de aulas.

### Perfil

O cliente poderá visualizar e editar seus próprios dados:

- nome completo;
- e-mail;
- telefone;
- data de nascimento;
- documento de identificação;
- endereço.

### Ficha de treino

O cliente poderá visualizar suas fichas de treino.

O cliente não poderá criar, editar, concluir ou arquivar fichas.

Cada cliente poderá possuir várias fichas. Uma ficha poderá conter:

- exercícios em texto livre;
- séries;
- repetições;
- carga/peso;
- tempo ou distância;
- observações do professor;
- status: ativa, concluída ou arquivada.

### Gamificação

O cliente poderá visualizar:

- pontos;
- badges/conquistas;
- metas individuais;
- streak de treinos;
- ranking semanal;
- ranking mensal.

### Notificações

Notificações não fazem parte do MVP.

## Escopo funcional administrativo

### Dashboard

O dashboard exibirá:

- ocupação e vagas por aula;
- total de clientes ativos;
- indicadores de gamificação.

### Usuários

O administrador poderá:

- criar usuários;
- editar usuários;
- desativar usuários;
- reativar usuários;
- excluir usuários.

Ao excluir um usuário, os registros históricos permanecem. Os dados pessoais serão anonimizados:

- nome;
- e-mail;
- telefone;
- data de nascimento;
- documento;
- endereço.

### Perfis e permissões

O administrador poderá:

- criar perfis de acesso;
- editar perfis;
- ativar e desativar perfis;
- excluir perfis sem usuários vinculados;
- atribuir um perfil a cada usuário;
- configurar permissões por módulo e ação;
- configurar o escopo de dados acessível ao perfil.

Cada usuário terá exatamente um perfil.

As ações disponíveis no catálogo de permissões serão:

- visualizar;
- criar;
- editar;
- excluir;
- executar.

Os módulos permissionáveis serão:

- usuários;
- perfis de acesso;
- dashboard;
- templates de aula;
- ocorrências/agendamento;
- reservas;
- clientes;
- planos;
- presença;
- fichas de treino;
- gamificação.

O perfil Cliente terá acesso limitado obrigatoriamente aos próprios dados. O administrador poderá configurar permissões do perfil, mas não poderá remover essa regra de isolamento.

O escopo poderá ser definido, conforme o módulo, como:

- todos os registros;
- clientes atribuídos;
- aulas atribuídas;
- registros próprios.

### Templates de aula

O administrador poderá criar, editar, ativar, desativar e excluir templates sem uso.

Um template conterá:

- nome;
- descrição;
- duração;
- capacidade máxima;
- modalidade/tipo de aula;
- professor padrão opcional.

Modalidades serão mantidas em um catálogo administrável. O administrador poderá criar, editar, ativar, desativar e excluir modalidades que não estejam em uso.

### Ocorrências e agenda

O administrador poderá:

- criar ocorrências manuais;
- criar ocorrências recorrentes;
- editar ocorrências;
- cancelar ocorrências;
- excluir ocorrências sem reservas;
- atribuir professor padrão na recorrência ou template;
- substituir o professor em uma ocorrência específica.

Uma ocorrência com reservas não poderá ser cancelada. Alterações que invalidem reservas existentes deverão ser recusadas.

### Reservas administrativas

Qualquer perfil que receba a permissão correspondente poderá criar reserva em nome de um cliente.

O painel poderá:

- consultar reservas;
- criar reservas;
- cancelar reservas;
- remarcar reservas;
- consultar conflitos;
- consultar disponibilidade.

Estados de reserva:

- confirmada;
- cancelada;
- concluída;
- não compareceu.

### Presença

Professor registra a presença dos clientes das suas aulas.

Os únicos estados de presença são:

- presente;
- faltou.

Quando o professor registra presença:

- presente transforma a reserva em concluída;
- faltou transforma a reserva em não compareceu.

### Clientes

O painel poderá:

- cadastrar clientes;
- editar clientes;
- consultar clientes;
- desativar clientes;
- reativar clientes;
- excluir clientes conforme a regra de anonimização.

### Planos

O administrador poderá:

- criar planos;
- editar planos;
- ativar e desativar planos;
- atribuir planos a clientes;
- consultar o histórico de planos.

Um cliente poderá ter apenas um plano ativo. Ao atribuir um novo plano, o plano anterior permanecerá automaticamente no histórico.

Dados do plano:

- nome;
- descrição;
- data de início;
- data de fim;
- status ativo/inativo.

### Fichas de treino

Qualquer perfil com permissão poderá criar e editar fichas dentro do próprio escopo de dados.

Professor poderá trabalhar com clientes relacionados a:

- aulas atribuídas;
- atribuições manuais feitas pelo administrador.

O administrador poderá conceder escopo mais amplo.

### Gamificação administrativa

Administrador, professor e cliente poderão visualizar gamificação conforme o escopo de suas permissões.

Professor poderá criar e atribuir metas individuais aos clientes.

Pontos, badges e streak serão atualizados automaticamente após o registro de presença e o cumprimento de metas.

As regras serão armazenadas em configuração inicial no banco ou em seed de configuração. Não ficarão espalhadas como regras hardcoded na interface ou em múltiplos pontos do backend.

Configuração inicial proposta:

- presença: 10 pontos;
- meta individual concluída: 25 pontos;
- streak de 3 presenças consecutivas: badge e 5 pontos;
- streak de 5 presenças consecutivas: badge e 10 pontos;
- streak de 10 presenças consecutivas: badge e 20 pontos;
- falta: reinicia o streak;
- cancelamento: não gera pontos e não conta como falta;
- ranking: soma de pontos no período semanal ou mensal;
- empate: maior número de presenças no período; persistindo o empate, mesma posição.

## Regras de reserva

A disponibilidade exibida no frontend é informativa. O backend é a fonte de verdade.

Uma reserva válida deve:

- respeitar a capacidade da aula;
- impedir reserva duplicada para a mesma aula;
- impedir duas reservas do mesmo cliente em horários sobrepostos;
- ocorrer enquanto houver vaga;
- ser confirmada dentro de uma transação;
- ser idempotente;
- retornar erro de negócio específico quando recusada.

Como não haverá janela configurável no MVP:

- reserva pode ocorrer enquanto houver vaga;
- cancelamento pode ocorrer até o início da aula;
- remarcação só confirma se a nova reserva for válida;
- se a remarcação falhar, a reserva original permanece.

Cenários de erro demonstráveis:

- aula cheia;
- conflito de horário;
- reserva duplicada;
- falta de permissão;
- cliente ou operação fora do escopo autorizado.

## Arquitetura técnica

### Frontend

- React;
- TypeScript;
- Vite;
- aplicação responsiva;
- PWA com manifest e service worker;
- cache apenas da interface/shell;
- dados e ações exigem conexão;
- REST + JSON para comunicação com o backend.

### Backend

- NestJS;
- TypeScript;
- Prisma;
- autenticação própria;
- autorização baseada em perfil, ação e escopo;
- access token e refresh token;
- refresh token em cookie `HttpOnly`, `Secure` e `SameSite`;
- regras de reserva centralizadas no backend.

### Banco

- PostgreSQL;
- Docker Compose local;
- Docker Compose na VPS;
- banco sem exposição pública;
- migrations Prisma;
- seed de configuração e usuário administrador inicial.

### Ambientes

Desenvolvimento local:

- frontend executado pelo Vite;
- backend executado pelo NestJS;
- PostgreSQL em Docker Compose.

Demonstração remota:

- frontend hospedado na Vercel;
- backend hospedado na VPS;
- PostgreSQL em Docker Compose na VPS;
- HTTPS no backend;
- banco acessível apenas pela aplicação e administração técnica.

O ambiente remoto não terá cadastro público. As contas compartilhadas de demonstração serão criadas pelo administrador depois da preparação manual dos dados.

O método de deploy automatizado será definido posteriormente.

## Segurança mínima

Para a demonstração com dados fictícios:

- login obrigatório;
- sem cadastro público;
- senhas armazenadas com hash seguro;
- controle de autorização no backend;
- HTTPS no ambiente remoto;
- refresh token protegido por cookie `HttpOnly`;
- dados do banco não expostos publicamente.

Antes de qualquer piloto com dados reais, o mínimo definido é:

- controle de acesso;
- HTTPS;
- proteção adequada das senhas.

## Reset da demonstração

O ambiente remoto terá comando técnico para:

- limpar os dados da demonstração;
- executar migrations;
- executar seeds;
- recriar o administrador inicial;
- restaurar as regras iniciais de gamificação e demais configurações técnicas.

Templates, modalidades, usuários, clientes, planos, aulas e fichas serão cadastrados manualmente pelo administrador após o reset.

O reset não será exposto como botão público na interface.

## Testes mínimos

### Backend

- reserva transacional;
- idempotência;
- capacidade da aula;
- conflito de horário;
- duplicidade;
- cancelamento;
- remarcação com preservação da reserva original em caso de falha;
- permissões por módulo, ação e escopo;
- criação, edição e anonimização de usuários;
- cálculo de pontos;
- cálculo de streak;
- conclusão de metas;
- ranking semanal e mensal.

### Frontend

Testes dos principais fluxos:

- login e logout;
- visão inicial do cliente;
- consulta de agenda;
- reserva;
- cancelamento;
- remarcação;
- consulta de plano;
- consulta de ficha;
- consulta de gamificação;
- dashboard administrativo;
- bloqueio visual de ações sem permissão.

## Fora do escopo

Não fazem parte deste MVP:

- app nativo iOS;
- app nativo Android;
- Expo no frontend desta etapa;
- HealthKit;
- Health Connect;
- aplicativo para Apple Watch;
- biometria;
- notificações;
- pagamentos;
- checkout;
- integrações financeiras;
- multi-tenant;
- múltiplas filiais;
- sincronização de dados offline;
- alta disponibilidade;
- múltiplas instâncias do backend;
- Load Balancer;
- SQS;
- EventBridge Scheduler;
- observabilidade avançada;
- automação de deploy;
- venda de produtos ou serviços;
- recuperação de senha;
- cadastro público.

## Decisões posteriores

Os seguintes pontos não bloqueiam o MVP e serão definidos depois:

- roteiro exato da demonstração;
- método de deploy automatizado;
- identidade visual final, caso novos assets de marca sejam fornecidos;
- evolução da infraestrutura remota após validação do piloto;
- migração ou reaproveitamento de componentes para o app Expo.

## Critério de transição para piloto

O protótipo estará pronto para apresentação quando:

- os fluxos principais estiverem funcionais;
- os testes mínimos estiverem verdes;
- o ambiente remoto estiver acessível por URL;
- o reset técnico funcionar;
- o administrador conseguir criar usuários e permissões;
- o cliente simulado conseguir completar o fluxo de reserva;
- o professor conseguir registrar presença;
- a gamificação refletir os eventos registrados;
- a interface estiver responsiva em desktop e mobile.

O avanço para piloto real dependerá da aprovação do decisor, não apenas da conclusão técnica do protótipo.
