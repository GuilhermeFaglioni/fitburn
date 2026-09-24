# Pendências e decisões futuras

Este arquivo evita que itens ainda não discutidos sejam tratados como decisões definitivas.

## Próximas decisões de alto nível

- confirmar Next.js + TypeScript como stack do painel web;
- decidir se o painel administrativo mobile será o mesmo app Expo com perfis ou um app separado;
- escolher REST, GraphQL ou outra forma de API;
- definir onde o painel web será hospedado;
- definir o escopo exato do S3;
- definir o que acontece com dados de wearable: exibição local, sincronização ou uso em gamificação;
- definir quais integrações financeiras existirão;
- definir domínio e certificados;
- definir ambientes de desenvolvimento, homologação e produção;
- definir estratégia de deploy e rollback;
- decidir quando EC2 única deve evoluir para múltiplas instâncias e Load Balancer.

## Detalhamento posterior

- validade, rotação, revogação e armazenamento de access/refresh tokens;
- matriz de permissões de cliente, professor e funcionário;
- cadastro, convite e recuperação de conta;
- retries, DLQ e política de falhas da SQS;
- política de lembretes e cancelamento no EventBridge Scheduler;
- IAM e Security Groups detalhados;
- certificados TLS;
- cache, se surgir necessidade real;
- observabilidade;
- backup e recuperação operacional;
- modelagem de dados;
- índices e constraints de agenda;
- contratos da API;
- testes de concorrência da reserva.

## Decisões conscientemente adiadas

Não foram escolhidos agora:

- Redis ou Valkey;
- Aurora;
- Load Balancer;
- NAT Gateway;
- Cognito ou provedor externo de autenticação;
- app próprio para Apple Watch;
- vendas e pagamentos dentro do app;
- microserviços;
- acesso direto dos clientes ao banco.
