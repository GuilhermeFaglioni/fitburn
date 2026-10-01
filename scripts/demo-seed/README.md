# Massa de demonstração para gravar vídeo (Guilherme Faglioni)

`pnpm demo:seed:guilherme` popula o seu ambiente **local** com uma massa fictícia para gravar a tela, tendo o cliente **Guilherme Faglioni** como protagonista. Rodar de novo é seguro: o que já existe (por nome, e-mail ou horário) é reaproveitado.

## Como rodar (Mac com Postgres no Docker)

```bash
git pull
pnpm install
pnpm db:up                                   # Postgres do docker-compose (porta 5432)
pnpm prisma:migrate                          # aplica as migrations
pnpm --filter @fitburn/api prisma:seed       # cria o administrador inicial (INITIAL_ADMIN_* do .env)
pnpm dev:api                                 # em outro terminal: API em http://localhost:3333/api
pnpm demo:seed:guilherme                     # este script (leva alguns segundos)
pnpm dev:web                                 # em outro terminal: o app em http://localhost:5173
```

**Rode o script pouco antes de gravar, no mesmo dia.** As datas são relativas a hoje (fuso da academia, America/Sao_Paulo) e a aula "ao vivo" de hoje nasce com base na hora em que o script roda. Para uma massa limpa no dia da gravação, rode `pnpm demo:reset --confirm-database=<nome do banco>` (apaga tudo; exige `DEMO_RESET_ENABLED=true`) e depois o seed do admin e este script.

## Variáveis de ambiente (todas opcionais)

| Variável                 | Padrão                                                | Para que serve                                                                                                                     |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`                | `http://localhost:$PORT/api` (`PORT` do `.env`, 3333) | Onde a API está.                                                                                                                   |
| `DEMO_CLIENT_NAME`       | `Guilherme Faglioni`                                  | Nome do protagonista.                                                                                                              |
| `DEMO_CLIENT_EMAIL`      | `guilherme.faglioni@fitburn.example`                  | E-mail do protagonista (só se o script precisar criá-lo).                                                                          |
| `DEMO_CLIENT_PASSWORD`   | `INITIAL_ADMIN_PASSWORD` do `.env`                    | Senha das contas **criadas** pelo script (protagonista, colegas, professores, recepção).                                           |
| `DEMO_SEED_ALLOW_REMOTE` | (desligado)                                           | `true` permite API/banco que não sejam `localhost`. Só para um ambiente descartável: o passo de histórico escreve direto no banco. |

Nenhuma credencial fica no repositório. Os e-mails usam o domínio reservado `.example` (não recebe e-mail) e os CPFs são inventados (formato válido, números fictícios).

## O que o script cria

Tudo pela API, como o administrador do `prisma:seed`, o professor e a recepção, **exceto** o passo de histórico (abaixo).

- **Protagonista:** se já existir um cliente com esse nome (busca em `GET /clients?search=`), ele é reaproveitado e **a senha dele não é alterada** (o resumo diz qual e-mail usar e de onde vem a senha). Senão é criado com telefone, nascimento, CPF fictício e endereço. Plano Performance ativo (início há 60 dias, fim em 30 dias; um Essencial anterior no histórico), 2 metas concluídas e 1 ativa pela professora, ficha de treino ativa (4 exercícios) e uma anterior concluída.
- **Mundo:** modalidades (Treino Funcional, Spinning, Yoga, Muay Thai), 4 templates (nomes iguais aos do `pnpm design:seed`, que são reaproveitados), 3 professores (Camila Andrade, Rafael Nogueira, Aline Rocha), 1 recepcionista (Bianca Leal) com os perfis "Professor" e "Recepção" e as permissões necessárias, 10 colegas simulados com nomes brasileiros, planos Performance e Essencial com atribuições, e atribuições professor-cliente.
- **Agenda:** de hoje a +14 dias, manhã, almoço e 18h/19h, capacidades de 6 a 14 e ocupação variada, sem sobreposição (espaço exclusivo). Uma aula com **uma vaga só** (Muay Thai, o protagonista pode pegar a última vaga ao vivo) e uma **lotada** (Spinning). Se o horário já estiver ocupado por outra aula sua, a aula é pulada com um aviso.
- **Reservas do protagonista:** 4 confirmadas nos próximos dias, uma delas hoje mais tarde (se ainda houver aula com pelo menos 2 horas de folga; senão o script avisa).
- **Histórico (passado):** 15 aulas dele nas últimas semanas (todos os dias de funcionamento na última semana, segundas, quartas e sextas antes), mais uma aula do começo de hoje, com presença registrada **pela professora/professor via API**: presente em quase todas, uma falta, uma presença corrigida para falta (aparece o estorno de pontos) e uma reserva cancelada. Os colegas têm histórico parecido, para o ranking ter 10 pessoas e o Guilherme entre os 3 primeiros. Resultado: 200+ pontos, streak de 9 presenças seguidas, badges de streak 3 e 5.
- **Aula ao vivo:** uma aula de hoje que já começou, com a professora Camila e 6 reservas (inclui o Guilherme), com a **presença deliberadamente pendente**. Na gravação, marcar o Guilherme como Presente leva o streak a 10, desbloqueia o badge de 10 e soma 30 pontos.

## O único ponto fora da API

A API não deixa reservar uma aula que já começou nem mudar o horário de uma aula com reservas. Para ter histórico, o script cria cada aula passada **no futuro** (daqui a 120+ dias, às 05:00), faz as reservas, e então a move para o passado com um `UPDATE` direto em `class_occurrences` (`startsAt` e `endsAt`) usando o `DATABASE_URL` do `.env`. Só depois disso a presença é registrada, pela API. Por isso o script:

- recusa rodar com `NODE_ENV=production`;
- recusa rodar se `API_URL` ou o host do `DATABASE_URL` não for `localhost`/`127.0.0.1`, a menos que `DEMO_SEED_ALLOW_REMOTE=true`;
- confere que o banco do `.env` é o mesmo que a API usa (se o `UPDATE` não achar a aula que a API acabou de criar, ele para com uma mensagem clara).

Se uma execução for interrompida no meio, sobram no máximo algumas aulas temporárias às 05:00 daqui a 120+ dias; a execução seguinte as remove.

## Limitações

- Rankings **semanal e mensal** somam só pontos do período. Na segunda-feira ou no dia 1º o período tem pouco conteúdo (o script compensa com a aula de hoje cedo e com as aulas dos últimos 7 dias, mas não dá para ter mais do que existe).
- Se o script rodar antes das 06:10, não há aula "ao vivo" (nenhum horário de hoje já começou); se rodar depois das ~18h, não há reserva "hoje mais tarde". Rode de novo no horário certo.
- Rodar em outro dia mantém o histórico antigo (as datas já passaram), completa a agenda dos próximos dias e cria uma nova aula ao vivo. Para recomeçar do zero use `pnpm demo:reset`.
- Os dados do `pnpm design:seed` convivem com estes (nomes de templates, modalidades e planos são reaproveitados); aulas que se sobreponham a aulas existentes são puladas com aviso.

## Resumo e roteiro

No fim o script imprime logins por perfil (e-mails e a origem das senhas, nunca a senha), o que foi criado, contagens do que existe agora (pontos, streak, badges, rankings, dashboard, ocupação) e um roteiro curto de gravação. Dica: use uma janela anônima ou um perfil de navegador por conta; o cookie de refresh é um só por navegador.
