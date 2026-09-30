# Checklist da massa de dados da demonstração

Lista do que o administrador da demo cadastra, à mão, depois do reset do ambiente remoto, para o [roteiro da demonstração](demo-script.md) funcionar. Fonte: Fase 9 (spec #10, ticket #54) e `docs/mvp-web-pwa.md` (Reset da demonstração, Público da demonstração).

Regras desta massa:

- **Cadastro manual pela interface**, como o MVP define. Não existe seed de dados de demonstração e este documento não cria um. A única exceção é a criação das contas de equipe, que não tem tela (seção 7).
- **Tudo é fictício**, com nomes e contextos de um estúdio boutique de aulas personalizadas.
- **Nenhuma credencial vai para o repositório**, nem de exemplo: senhas e e-mails reais das contas ficam no gerenciador de senhas da equipe. Onde este documento pede uma senha, ele mostra `<definir fora do repositório>`.
- Datas são relativas: **D** é o dia da demonstração, **D-1** a véspera, **D+1** o dia seguinte.
- Convenções dos dados de exemplo: e-mails `nome.sobrenome@demo.fitburn.example` (o domínio `.example` é reservado e não recebe e-mail), telefones `(11) 90000-00NN`, documentos `DEMO-00NN` (o documento é único por pessoa; não use CPF real).

## 1. Linha do tempo

| Quando | O que fazer | Tempo |
|---|---|---|
| D-2 ou antes | Ensaio completo com o roteiro (item 15 da spec #10). Não é a massa final. | 1 h |
| D-1, a partir das 10h30 | Reset (seção 3), seções 5 a 11 e a grade (12). Depois, preparar as aulas-relâmpago (seção 14, passos 1 e 2). | 2 h |
| D-1, 13h às 17h | Aulas-relâmpago acontecendo (seção 14); enquanto esperam, seções 12, 13 e 15. | 2 h |
| D-1, fim da tarde | Verificação final (seção 16). | 20 min |
| D, 30 min antes da demo | Verificação final de novo (só a parte "Antes da demo"); PR se precisar (seção 13). | 20 min |

O que decide a linha do tempo: reservas só existem antes de a aula começar, e pontos de ranking só nascem quando o professor marca presença numa aula que já começou. Não há como cadastrar reservas e presenças "passadas" pela interface; a seção 14 explica o caminho (aulas curtas em tempo real).

Evite marcar a demo numa **segunda-feira** (o ranking semanal recomeça na segunda e ficaria vazio) e no **dia 1º do mês** (o mensal também). Se não der, o roteiro usa a aba **Mensal** do ranking (Ato 5); o Dashboard (Ato 6) já mostra o mês atual, e as aulas-relâmpago precisam cair no mesmo mês.

## 2. Ordem de cadastro

Respeite a ordem, porque cada item depende do anterior:

1. Reset (seção 3) e login do administrador.
2. Modalidades (5), perfis Professor e Funcionário administrativo (6), usuários da equipe (7), templates (8).
3. Clientes (9), planos (10), atribuições a professores (11).
4. Grade da semana (12), aulas de cena e reservas de cena (13).
5. Histórico para o ranking (14), fichas e metas (15).
6. Verificação final (16).

## 3. Estado depois do reset

O reset (`pnpm demo:reset --confirm-database=<nome do banco>`, na VPS via `docker compose exec`, passo a passo em [deploy-runbook.md](deploy-runbook.md), seção 9) apaga **tudo**, inclusive as contas de equipe e os clientes, roda migrations e seeds e deixa:

- o usuário administrador inicial (e-mail, senha e nome vêm de `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` e `INITIAL_ADMIN_NAME` do ambiente; nunca no repositório);
- os perfis de sistema **Administrador** e **Cliente**;
- as regras de gamificação (presença 10 pontos, meta 25, streak de 3, 5 e 10 presenças com bônus de 5, 10 e 20 pontos).

Confira depois do reset: login do administrador funciona; **Usuários e perfis** lista só ele e os perfis Administrador e Cliente; o Dashboard mostra tudo zerado. Só então comece a seção 5.

## 4. Contas por perfil (sem credenciais)

Uma conta compartilhada por papel. E-mails seguem a convenção acima; senhas: `<definir fora do repositório>` (mínimo de 8 caracteres para clientes e equipe, 12 para o administrador inicial; use o gerenciador de senhas, uma senha distinta por conta). Como o reset apaga todas as contas, guarde as credenciais no cofre da equipe e reaproveite as mesmas ao recadastrar.

| Perfil de acesso | Nome | E-mail | Senha | Papel na demo |
|---|---|---|---|---|
| Administrador | valor de `INITIAL_ADMIN_NAME` (sugestão: um nome de pessoa, ex.: Helena Duarte) | `<definir fora do repositório>` | `<definir fora do repositório>` | Opera tudo (Atos 1, 3 e 6) |
| Professor | Camila Andrade | `camila.andrade@demo.fitburn.example` | `<definir fora do repositório>` | Presença e metas (Atos 3, 4 e 5) |
| Professor | Rafael Nogueira | `rafael.nogueira@demo.fitburn.example` | `<definir fora do repositório>` | Professor das aulas de cena e do histórico; fora do escopo da Camila |
| Funcionário administrativo | Bianca Leal | `bianca.leal@demo.fitburn.example` | `<definir fora do repositório>` | Recepção: reservas, clientes e planos (Ato 3) |
| Cliente | Marina Albuquerque | `marina.albuquerque@demo.fitburn.example` | `<definir fora do repositório>` | Cliente A (desktop) |
| Cliente | Thiago Bastos | `thiago.bastos@demo.fitburn.example` | `<definir fora do repositório>` | Cliente B (celular, PWA) |
| Cliente | Larissa Mendonça, Otávio Ribeiro, Juliana Prado, Fernando Cavalcanti, Beatriz Nakamura, Gustavo Farias | seção 9 | `<definir fora do repositório>` | Figurantes: ranking, escopo, aula cheia |

A Renata Vasconcelos (cliente cadastrada ao vivo no Ato 1) não entra nesta tabela: **não a cadastre antes**.

## 5. Modalidades

Menu **Templates & modalidades**, aba **Modalidades**, **+ Nova modalidade** (Nome, Descrição, **Salvar modalidade**). O cartão da agenda do cliente mostra o nome da modalidade, então escolha nomes que leiam bem.

| Nome | Descrição |
|---|---|
| Pilates | Pilates de solo e de aparelhos, com foco em postura e core. |
| Yoga | Vinyasa e respiração para mobilidade e foco. |
| Funcional | Circuitos de corpo inteiro com carga moderada. |
| Treino de Força | Musculação guiada em turma reduzida. |
| Boxe | Técnica de boxe como condicionamento físico. |
| Mobilidade | Alongamento ativo e liberação miofascial. |
| Personal Studio | Sessão individual com professor exclusivo. |

## 6. Perfis Professor e Funcionário administrativo

Menu **Usuários e perfis**, aba **Perfis de acesso**, **+ Novo perfil** (Nome, Descrição, **Criar perfil**). Selecione o perfil e, na "Matriz de permissões", marque as ações e escolha o **Escopo** de cada módulo; **Salvar** é por linha (linha sem ação marcada = sem acesso; o escopo padrão de uma linha nova é "Registros próprios"). Só o perfil de sistema Cliente tem escopo fixo; o Administrador é sempre total.

**Professor** (descrição: "Conduz aulas, registra presença e acompanha os próprios alunos.")

| Módulo | Ações | Escopo |
|---|---|---|
| Dashboard | Visualizar | Qualquer (o dashboard usa o escopo de cada módulo que o alimenta) |
| Ocorrências/Agendamento | Visualizar | Aulas atribuídas |
| Presença | Visualizar, Executar | Aulas atribuídas |
| Clientes | Visualizar | Clientes atribuídos |
| Fichas de treino | Visualizar, Criar, Editar | Clientes atribuídos |
| Gamificação | Visualizar, Criar, Editar | Clientes atribuídos |
| Demais módulos | nenhuma | n/a |

Menu esperado do Professor: Dashboard, Clientes, Agenda, Fichas de treino, Metas, Minhas aulas.

**Funcionário administrativo** (descrição: "Recepção: reservas, clientes e planos.")

| Módulo | Ações | Escopo |
|---|---|---|
| Dashboard | Visualizar | Todos os registros |
| Templates de aula | Visualizar | Todos os registros |
| Ocorrências/Agendamento | Visualizar | Todos os registros |
| Reservas | Visualizar, Criar, Editar | Todos os registros |
| Clientes | Visualizar, Criar, Editar | Todos os registros |
| Planos | Visualizar, Criar, Editar | Todos os registros |
| Gamificação | Visualizar | Todos os registros |
| Demais módulos (Usuários, Perfis de acesso, Presença, Fichas) | nenhuma | n/a |

Sem **Excluir** em Clientes e sem **Criar/Editar** em Ocorrências de propósito: são os botões bloqueados do cenário de falta de permissão (roteiro 3.4). Como Clientes tem **Criar** com escopo total, o menu da Bianca também mostra "Atribuições"; é esperado. Menu esperado: Dashboard, Clientes, Agenda, Reservas, Planos, Templates & modalidades, Metas, Atribuições.

## 7. Usuários da equipe (via API, não há tela)

A interface só cadastra **clientes** (**+ Novo cliente**, página "Novo cliente"). Professores e funcionários se criam pela API (`POST /api/users/staff`, permissão Usuários: Criar), e não há tela para trocar o perfil de um usuário nem para redefinir senha (`PATCH /api/users/:id` com `profileId` e `POST /api/users/:id/reset-password` existem só na API). Registre isso como pendência de produto no ensaio (spec #10, item 17).

Numa máquina com bash, `curl` e `jq`, digitando as credenciais sem gravá-las no histórico do shell:

```bash
API="https://<URL da Vercel ou DOMAIN da API>/api"
read -r  -p "E-mail do administrador: " ADMIN_EMAIL
read -rs -p "Senha do administrador: " ADMIN_PASSWORD; echo

TOKEN=$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}')" \
  | jq -r .accessToken)

# ids dos perfis (Professor e Funcionário administrativo, criados na seção 6)
curl -sS "$API/profiles" -H "Authorization: Bearer $TOKEN" | jq '.[] | {id, name}'

# cria uma conta de equipe (repita para cada linha da tabela; a senha vem do cofre)
read -rs -p "Senha da conta: " STAFF_PASSWORD; echo
curl -sS -X POST "$API/users/staff" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg n "Camila Andrade" --arg e "camila.andrade@demo.fitburn.example" \
        --arg p "$STAFF_PASSWORD" --arg id "<id do perfil Professor>" \
        '{fullName:$n,email:$e,password:$p,profileId:$id}')"
```

| Nome | E-mail | Perfil |
|---|---|---|
| Camila Andrade | `camila.andrade@demo.fitburn.example` | Professor |
| Rafael Nogueira | `rafael.nogueira@demo.fitburn.example` | Professor |
| Bianca Leal | `bianca.leal@demo.fitburn.example` | Funcionário administrativo |

Confira em **Usuários e perfis**, aba **Usuários**: as três contas aparecem com o selo do perfil e ATIVO. Faça o login de cada uma numa janela anônima e confira o menu esperado da seção 6. Toda a equipe ativa aparece como opção de "Professor" nas aulas (o administrador também).

## 8. Templates de aula

Menu **Templates & modalidades**, aba **Templates de aula**, **+ Novo template** (Nome, Descrição, Modalidade, Duração (min), Capacidade, Professor padrão, **Salvar template**). O nome do template é o nome da aula que o cliente vê no detalhe, nas mensagens e no histórico.

| Nome | Modalidade | Duração | Capacidade | Professor padrão | Descrição |
|---|---|---|---|---|---|
| Pilates Reformer | Pilates | 50 | 4 | Camila Andrade | Aparelhos Reformer em turma reduzida. |
| Yoga Vinyasa | Yoga | 60 | 6 | Camila Andrade | Sequências fluidas com respiração guiada. |
| Mobilidade & Alongamento | Mobilidade | 40 | 6 | Camila Andrade | Alongamento ativo para recuperação. |
| Funcional Intenso | Funcional | 45 | 6 | Rafael Nogueira | Circuito de corpo inteiro com carga moderada. |
| Funcional Express | Funcional | 15 | 6 | Rafael Nogueira | Sessão rápida de 15 minutos para o horário do almoço. |
| Força & Hipertrofia | Treino de Força | 60 | 4 | Rafael Nogueira | Treino de força guiado em turma reduzida. |
| Boxe Fitness | Boxe | 50 | 5 | Rafael Nogueira | Técnica de boxe como condicionamento. |
| Personal Studio 1:1 | Personal Studio | 50 | 1 | Rafael Nogueira | Sessão individual com professor exclusivo. |

"Personal Studio 1:1" tem **uma única vaga** por definição: é a base das aulas R1 e R2 (seção 13). "Funcional Express" (15 minutos) é o que permite montar o histórico em algumas horas (seção 14).

## 9. Clientes simulados

Menu **Clientes**, **+ Novo cliente** (página "Novo cliente", rota `/clientes/novo`; ao salvar volta para a lista de clientes). Todos os campos são obrigatórios: Nome completo, E-mail, Telefone, Data de nascimento, CPF, Endereço e **Senha inicial** (`<definir fora do repositório>`, mínimo de 8 caracteres). O documento é único por cliente.

| Nome | E-mail | Telefone | Nascimento | Documento | Endereço | Contexto |
|---|---|---|---|---|---|---|
| Marina Albuquerque | `marina.albuquerque@demo.fitburn.example` | (11) 90000-0001 | 1992-03-14 | DEMO-0001 | Rua das Acácias, 120, Vila Madalena, São Paulo/SP | Advogada, treina Pilates e Yoga há 8 meses. **Cliente A**. |
| Thiago Bastos | `thiago.bastos@demo.fitburn.example` | (11) 90000-0002 | 1997-08-02 | DEMO-0002 | Alameda dos Ipês, 45, apto 82, Pinheiros, São Paulo/SP | Desenvolvedor, iniciante, primeira semana no estúdio. **Cliente B**. |
| Larissa Mendonça | `larissa.mendonca@demo.fitburn.example` | (11) 90000-0003 | 1985-11-27 | DEMO-0003 | Rua Harmonia, 310, Vila Madalena, São Paulo/SP | Empresária, alta frequência, líder do ranking. |
| Otávio Ribeiro | `otavio.ribeiro@demo.fitburn.example` | (11) 90000-0004 | 1974-05-09 | DEMO-0004 | Rua Cardeal Arcoverde, 88, Pinheiros, São Paulo/SP | Médico, treina antes do plantão. |
| Juliana Prado | `juliana.prado@demo.fitburn.example` | (11) 90000-0005 | 1999-01-21 | DEMO-0005 | Rua Fradique Coutinho, 502, Pinheiros, São Paulo/SP | Designer, frequência irregular. |
| Fernando Cavalcanti | `fernando.cavalcanti@demo.fitburn.example` | (11) 90000-0006 | 1981-09-30 | DEMO-0006 | Rua Mourato Coelho, 77, Vila Madalena, São Paulo/SP | Engenheiro, voltando de uma lesão no joelho. |
| Beatriz Nakamura | `beatriz.nakamura@demo.fitburn.example` | (11) 90000-0007 | 1994-06-18 | DEMO-0007 | Rua Aspicuelta, 205, Vila Madalena, São Paulo/SP | Arquiteta, Yoga e Pilates. |
| Gustavo Farias | `gustavo.farias@demo.fitburn.example` | (11) 90000-0008 | 1989-12-05 | DEMO-0008 | Rua Wisard, 410, Vila Madalena, São Paulo/SP | Treina só Força com o professor Rafael. **Fora do escopo da Camila.** |
| Renata Vasconcelos | `renata.vasconcelos@demo.fitburn.example` | (11) 90000-0009 | 1991-04-25 | DEMO-0009 | Rua Girassol, 66, Vila Madalena, São Paulo/SP | **Não cadastre antes**: é criada ao vivo no Ato 1. |

Oito clientes ativos antes da demo, nove depois do Ato 1.

## 10. Planos e planos atribuídos

Menu **Planos**. Em **Catálogo de planos**, **+ Novo plano** (Nome, Descrição, salvar). Depois, em **Atribuir a cliente**, escolha Cliente, Plano, **Início** e **Término** e clique **Atribuir plano**. O plano é informativo: não limita reservas.

| Plano | Descrição |
|---|---|
| Essencial | Até 2 aulas por semana. Ideal para começar. |
| Performance | Até 4 aulas por semana, com ficha de treino individual. |
| Livre | Aulas ilimitadas em todas as modalidades. |

| Cliente | Plano | Início | Término |
|---|---|---|---|
| Marina Albuquerque | Performance | D-30 | D+60 |
| Thiago Bastos | Essencial | D-3 | D+87 |
| Larissa Mendonça | Essencial (primeiro) e depois Performance | Essencial: D-120 a D-31; Performance: D-30 | Performance: D+60 |
| Otávio Ribeiro | Performance | D-45 | D+45 |
| Juliana Prado | Essencial | D-20 | D+70 |
| Fernando Cavalcanti | Essencial | D-15 | D+75 |
| Beatriz Nakamura | Livre | D-10 | D+80 |
| Gustavo Farias | Performance | D-25 | D+65 |

Para a Larissa, atribua **primeiro o Essencial** e depois o Performance: ao atribuir o novo plano, o anterior passa para o histórico (a tela avisa "... já possui um plano ativo" e o botão vira **Atribuir e substituir o atual**). O cliente vê isso em **Plano**, "Histórico de planos". A Renata recebe o Performance ao vivo (Ato 1).

## 11. Atribuições de clientes a professores

Menu **Atribuições** ("Atribuição de clientes a professores"): escolha o professor, selecione o cliente e clique **Atribuir**. Essas atribuições, mais as reservas nas aulas do professor, definem o escopo "Clientes atribuídos".

| Professor | Clientes atribuídos |
|---|---|
| Camila Andrade | Marina Albuquerque, Thiago Bastos, Beatriz Nakamura, Larissa Mendonça |
| Rafael Nogueira | Fernando Cavalcanti, Gustavo Farias, Otávio Ribeiro, Juliana Prado |

**Não reserve o Gustavo (nem os outros quatro do Rafael) em aulas da Camila**: quem tem reserva numa aula dela entra no escopo dela, e o Gustavo precisa continuar fora para o cenário 3.5.

## 12. Grade de ocorrências da semana

Menu **Agenda**, **+ Nova aula** com **Recorrência = Repetir semanalmente**: escolha o template, a **Data** inicial, o **Horário**, os **Dias da semana**, **Repetir até** e **Salvar**. **Data** inicial = a segunda-feira da semana de D (a grade da semana atual aparece completa na Agenda; nos dias que já passaram as aulas ficam com 0 reservas); **Repetir até** = D+28. A agenda é um espaço exclusivo (nunca duas aulas ao mesmo tempo) e a criação recorrente é tudo ou nada; se uma série recusar por sobreposição, a mensagem lista as datas em conflito.

| Template | Dias | Horário | Professor |
|---|---|---|---|
| Funcional Intenso | SEG, QUA, SEX | 07:00 | Rafael Nogueira |
| Pilates Reformer | SEG, TER, QUA, QUI, SEX | 08:00 | Camila Andrade |
| Mobilidade & Alongamento | TER, QUI | 12:00 | Camila Andrade |
| Força & Hipertrofia | SEG, TER, QUA, QUI | 18:00 | Rafael Nogueira |
| Boxe Fitness | SEG, QUA | 19:00 | Rafael Nogueira |
| Yoga Vinyasa | TER, QUI | 19:00 | Camila Andrade |
| Yoga Vinyasa | SEX | 18:00 | Camila Andrade |
| Funcional Intenso | SÁB | 09:00 | Rafael Nogueira |
| Yoga Vinyasa | SÁB | 10:00 | Camila Andrade |

A janela das **12h40 às 18h00** fica livre todos os dias: é onde entram as aulas de cena (seção 13) e as aulas-relâmpago (seção 14). Nada é cadastrado para o domingo.

Confira em **Agenda** (semana atual e próxima): as aulas aparecem como "HH:MM Modalidade Prof. X · 0/N", sem sobreposição.

## 13. Aulas de cena e reservas de cena

Aulas avulsas do roteiro, criadas em **Agenda**, **+ Nova aula** (sem recorrência). Elas usam a janela livre da tarde de **D+1**. Altere **Capacidade** e **Professor** no formulário quando a tabela pedir.

| Código | Template | Quando | Capacidade | Professor | Uso no roteiro |
|---|---|---|---|---|---|
| R1 | Personal Studio 1:1 | D+1, 14:00 | 1 (a **aula com uma única vaga**) | Rafael Nogueira | Disputa pela última vaga (3.6); conflito de horário (3.2, criar uma aula às 14:10) |
| R2 | Personal Studio 1:1 | D+1, 15:00 | 1 | Rafael Nogueira | Remarcação recusada (3.7) |
| F | Força & Hipertrofia | D+1, 16:00 | **2** (troque de 4 para 2) | Rafael Nogueira | Aula cheia (3.1); Ocupação no Dashboard |
| X | Yoga Vinyasa | D+1, 17:00 | 6 | Camila Andrade | Reserva da Marina: reserva duplicada (3.3) e origem da remarcação (3.7) |
| S | Uma "Mobilidade & Alongamento" da grade, D+2 ou depois | conforme a grade | 6 | Camila Andrade | Reserva descartável do Thiago (3.4) |
| LR e LR2 | Duas aulas da grade em dias diferentes, com 4 vagas livres ou mais, fora de D+1 (por exemplo, Yoga Vinyasa e Mobilidade & Alongamento) | conforme a grade | conforme a grade | conforme a grade | Reservar, remarcar e cancelar ao vivo (Ato 2). Sem reservas da Marina. |
| P | "Pilates Reformer" da grade, **D às 08:00** (se D cair no fim de semana, crie uma avulsa) | D, 08:00 | 4 | Camila Andrade | Presença (Ato 4) e gamificação (Ato 5). Precisa **já ter começado** na hora da demo: se a demo for antes das 8h, ajuste o horário de P (para uma hora livre, antes da demo) ou use PR. |
| PR | Funcional Express (plano B) | D, num horário livre que comece 15 minutos depois de você cadastrá-la | 6 | **Camila Andrade** (troque no campo Professor) | Só se P não tiver começado a tempo. Cadastre e reserve **30 minutos antes da demo**: ela começa 15 minutos antes da demo e já está aberta para presença no Ato 4. |

Reservas de cena (em **Reservas**, **+ Nova reserva**: Cliente, Aula, **Confirmar reserva**; a lista de aulas mostra as próximas duas semanas):

| Aula | Reservas |
|---|---|
| R1 | nenhuma |
| R2 | nenhuma |
| F | Otávio Ribeiro, Beatriz Nakamura (lotada: 2/2) |
| X | Marina Albuquerque |
| S | Thiago Bastos |
| P | Marina Albuquerque, Thiago Bastos, Beatriz Nakamura (feitas na **véspera**; depois que a aula começa não é mais possível reservar) |
| LR, LR2 | nenhuma |
| PR (só se criada) | Marina Albuquerque, Thiago Bastos, Beatriz Nakamura |

## 14. Histórico para o ranking (aulas-relâmpago)

O ranking só tem conteúdo com presenças registradas, e presença só existe depois do início da aula, sobre uma reserva feita antes do início. Como o reset é feito na véspera e recadastrar leva horas, o histórico é montado em tempo real com **três aulas curtas** (Funcional Express, 15 minutos) na janela livre da tarde da véspera. Metas concluídas somam pontos sem esperar aula (seção 15).

1. Escolha T0 (agora, entre 13h e 17h) e crie três aulas em **Agenda**, **+ Nova aula**, template **Funcional Express**, data D-1, professor Rafael, capacidade 6: **H1** às T0+15 min, **H2** às T0+30 min e **H3** às T0+45 min (arredonde para múltiplos de 5). Aulas coladas (uma termina quando a outra começa) são permitidas.
2. Em **Reservas**, **+ Nova reserva**, cadastre as 15 reservas abaixo. Faça primeiro as da H1 (o prazo é o início dela).
3. Depois que cada aula começar, registre a presença: login do Rafael (ou do Administrador), **Minhas aulas**, aba **Hoje**, toque na aula, **Presente** ou **Faltou** por cliente.

| Cliente | H1 | H2 | H3 | Resultado |
|---|---|---|---|---|
| Larissa Mendonça | Presente | Presente | Presente | 3 presenças seguidas: 30 pontos + bônus de 5 (streak de 3) |
| Otávio Ribeiro | Presente | Presente | Presente | 35 pontos, badge "Streak de 3" |
| Marina Albuquerque | Presente | Presente | sem reserva | 20 pontos, streak de 2 (a P leva ao streak de 3 na demo) |
| Juliana Prado | Presente | Presente | **Faltou** | 20 pontos, streak reiniciado (última marcação foi falta) |
| Fernando Cavalcanti | Presente | **Faltou** | **Faltou** | 10 pontos, streak reiniciado |
| Gustavo Farias | Presente | sem reserva | sem reserva | 10 pontos |

Total: 6 + 5 + 4 = 15 reservas. Thiago, Beatriz e Renata não têm histórico (Thiago e Beatriz pontuam na P; ver Ato 4).

Se o reset for feito com dias de antecedência, dá para deixar passarem aulas normais da grade e registrar a presença a cada dia; o resultado é o mesmo com nomes de aula mais naturais. Não dá para registrar presença em aula que ainda não começou, nem reservar em aula que já começou.

## 15. Fichas de treino e metas

**Fichas.** Menu **Fichas de treino**, **Selecione um aluno**, **+ Nova ficha**: Título, Status (Ativa, Concluída, Arquivada), Observações gerais, **+ Adicionar exercício** (Exercício, Séries, Repetições, Carga, Tempo, Distância, Observações) e **Salvar ficha**. Cada professor cria as fichas dos alunos do seu escopo (entre com a conta do professor, não a do administrador, para o autor aparecer certo em "Montada por ...").

| Aluno | Autor | Título | Status | Exercícios |
|---|---|---|---|---|
| Marina Albuquerque | Camila Andrade | Fase 2: força e mobilidade | Ativa | Agachamento goblet (4 séries, 10 repetições, 16 kg); Remada baixa (3 séries, 12 repetições, 25 kg); Prancha lateral (3 séries, 30 s por lado; obs.: "Manter o quadril alinhado.") |
| Marina Albuquerque | Camila Andrade | Fase 1: adaptação | Concluída | Ponte glútea (3 séries, 15 repetições); Bird-dog (3 séries, 10 repetições) |
| Thiago Bastos | Camila Andrade | Adaptação: semanas 1 a 4 | Ativa | Ponte glútea (3 séries, 15 repetições); Remada com elástico (3 séries, 12 repetições); Caminhada leve (distância 1 km) |
| Larissa Mendonça | Camila Andrade | Performance: bloco A | Ativa | Levantamento terra romeno (4 séries, 8 repetições, 30 kg); Afundo (3 séries, 10 repetições por perna) |
| Fernando Cavalcanti | Rafael Nogueira | Reabilitação de joelho: fase 2 | Ativa | Leg press (3 séries, 12 repetições, 40 kg; obs.: "Amplitude até 60 graus, sem dor."); Bicicleta (10 min) |
| Gustavo Farias | Rafael Nogueira | Hipertrofia: ABC | Ativa | Supino reto (4 séries, 8 repetições, 50 kg); Puxada frontal (4 séries, 10 repetições, 45 kg) |

**Metas.** Menu **Metas**, **Selecione um aluno**, **+ Nova meta** (Título, Descrição, Prazo, **Criar meta**). A meta concluída soma 25 pontos na hora, na data da conclusão.

| Aluno | Autor | Título | Estado |
|---|---|---|---|
| Larissa Mendonça | Camila Andrade | Frequentar 3 aulas na mesma semana | **Concluir** e **Confirmar** na véspera (+25 pontos) |
| Marina Albuquerque | Camila Andrade | Completar 5 aulas de Pilates neste mês | Ativa (concluir ao vivo é opcional, Ato 5) |
| Thiago Bastos | Camila Andrade | Completar a primeira semana de treinos | Ativa |
| Fernando Cavalcanti | Rafael Nogueira | Fazer mobilidade duas vezes por semana | Ativa |

Prazo das metas ativas: último dia do mês da demo.

## 16. Verificação final

**Depois do cadastro (D-1) e de novo 30 minutos antes da demo.** Logins: entre com cada conta numa janela própria e confira.

| Conta | Deve ver |
|---|---|
| Administrador | Menu completo (11 itens) |
| Camila (Professor) | Dashboard, Clientes, Agenda, Fichas de treino, Metas, Minhas aulas; em Clientes só Marina, Thiago, Beatriz e Larissa |
| Bianca (Funcionário administrativo) | Dashboard, Clientes, Agenda, Reservas, Planos, Templates & modalidades, Metas, Atribuições; "+ Nova aula" desabilitado |
| Marina, Thiago (Cliente) | Barra lateral: Home, Agenda, Plano, Ficha de treino, Perfil (sem "Sair": a saída é "Sair da conta" no Perfil); no celular, barra inferior com Treino no lugar de Ficha de treino |

**Aulas de cena** (Agenda do cliente, dia D+1): R1 "1/1 vagas", R2 "1/1 vagas", F "0/2 · lotada", X com reserva da Marina (a grade não a marca: abra a aula e veja o selo RESERVA CONFIRMADA; a Home a lista em Próximas aulas); P com 3 reservas (Minhas aulas da Camila, "0 de 3 registrados"); LR e LR2 com vagas e sem reserva da Marina; S com 1 reserva (Thiago).

**Gamificação antes do Ato 4** (todas as aulas-relâmpago na mesma semana da demo):

| Cliente | Pontos | Presenças | Streak atual |
|---|---|---|---|
| Larissa Mendonça | 60 (30 + 5 + 25 da meta) | 3 | 3 |
| Otávio Ribeiro | 35 | 3 | 3 |
| Marina Albuquerque | 20 | 2 | 2 |
| Juliana Prado | 20 | 2 | 0 |
| Fernando Cavalcanti | 10 | 1 | 0 |
| Gustavo Farias | 10 | 1 | 1 |
| Thiago Bastos, Beatriz Nakamura | 0 (fora do ranking) | 0 | 0 |

Ranking semanal (tela Sua evolução de qualquer cliente): 1º Larissa M.; 2º Otávio R.; 3º Juliana P. e Marina A. (empate); 5º Fernando C. e Gustavo F. (empate). Dashboard: Pontos distribuídos no mês **155**, Streaks ativos **4**, Clientes ativos **8** (o painel de ranking mostra os 3 primeiros com "N presenças").

**Depois do Ato 4** (Marina e Thiago presentes, Beatriz faltou; sem concluir a meta da Marina): Marina 35 pontos e 3 presenças (badge "Streak de 3", empate em 2º com Otávio), Thiago 10; Dashboard: Pontos distribuídos no mês **180**, Streaks ativos **5**, Clientes ativos **9** (com a Renata). Se a meta da Marina for concluída ao vivo: Marina 60 pontos, empate em 1º com a Larissa.

O Dashboard conta o mês atual: os números acima valem enquanto as aulas-relâmpago e a demo caírem no mesmo mês. Se a semana virou, só o ranking **Semanal** dos clientes (tela Sua evolução) ficará menor.

## 17. Armadilhas

- **Reset apaga tudo, inclusive as contas.** Recadastre com as mesmas credenciais do cofre. Deixe `DEMO_RESET_ENABLED` desligada fora do momento do reset.
- **Um perfil de navegador por conta ativa** (o cookie de refresh é compartilhado) e faça login antes da demo: 10 tentativas com falha por minuto e por IP travam o login de todos.
- **Horários são os de Brasília** (America/Sao_Paulo), independentemente do fuso do aparelho. A presença abre pelo relógio do servidor.
- **Aulas com reservas não podem ser canceladas nem excluídas** (a tela bloqueia e o servidor recusa). Para desfazer uma aula de cena cadastrada errado, cancele antes as reservas dela em **Reservas**.
- **Uma reserva por cliente por aula** e nunca duas aulas ao mesmo tempo no estúdio: se uma reserva de cena recusar, leia a mensagem (aula cheia, duplicada ou já iniciada).
- **Gustavo, Fernando, Juliana e Otávio só em aulas do Rafael.** Qualquer reserva deles numa aula da Camila os coloca no escopo dela e quebra o cenário 3.5.
- **Não conclua a meta da Marina, não registre a presença da P nem use a PR antes da demo**: presença e meta não voltam para "pendente" (o ensaio final deve usar aulas que a demo não consome, ou deve ser seguido de novo reset e recadastro).
- **E-mail e documento são únicos.** Use exatamente as convenções acima para não colidir ao recadastrar.
