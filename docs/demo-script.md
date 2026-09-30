# Roteiro da demonstração

Roteiro para apresentar o MVP Web + PWA do Fitburn a um decisor da academia. Fonte: Fase 9 (spec #10, ticket #54), `docs/mvp-web-pwa.md` (Público da demonstração, Regras de reserva, Critério de transição para piloto) e o código da aplicação (nomes de telas, botões e mensagens abaixo são os que o app mostra hoje).

O objetivo da demo não é operar a academia: é fazer o decisor aprovar um piloto real. A história é: **a equipe opera a agenda → o cliente reserva → o sistema recusa com clareza quando deve → o professor registra a presença → a gamificação reage → o dashboard mostra o resultado**.

Este roteiro assume a massa de dados de [demo-data-checklist.md](demo-data-checklist.md) já cadastrada (nomes, aulas de cena e códigos R1, R2, F, X, S, LR, LR2, P, PR estão definidos lá). Os números que aparecem nas telas dependem dela; a seção "Estado esperado" do checklist diz o que conferir antes de começar.

Duração: cerca de 45 minutos com dois apresentadores (apresentador e copiloto), 55 com um só.

## Antes de começar (30 minutos antes)

1. Rode a verificação final do checklist (seção 16). Se algum número divergir, corrija antes ou use os planos B abaixo.
2. **Uma sessão por perfil de navegador.** O login guarda um cookie de refresh por navegador: dois usuários no mesmo perfil do Chrome se atropelam (o mais recente vale para todas as abas). Use perfis do Chrome ou janelas anônimas, uma por conta ativa.
3. Faça login em todas as contas **antes** de o público chegar. O login recusa depois de 10 tentativas com falha em 60 segundos por IP (`TOO_MANY_REQUESTS`, HTTP 429), e num Wi-Fi compartilhado o IP é o mesmo para todos. Só as falhas contam; se acontecer, espere 60 segundos.
4. Confira o relógio do notebook e do celular (hora automática ligada). A presença abre pelo horário do servidor; o botão da tela usa o relógio do navegador. Relógio adiantado habilita o botão, mas o servidor recusa.
5. Se o app mostrar **"Nova versão disponível."** com o botão **Recarregar**, clique nele antes de começar.
6. Instale a PWA no celular antes (Android/Chrome: menu, "Instalar app"; iPhone/Safari: Compartilhar, "Adicionar à Tela de Início") e faça login **dentro do app instalado**, não no navegador. Confira no aparelho que o ícone e o nome ("Fitburn") aparecem; se o ícone sair genérico no iPhone, veja "O que não prometer" no fim.

### Contas e dispositivos

As credenciais ficam no gerenciador de senhas da equipe, fora do repositório (ver [demo-data-checklist.md](demo-data-checklist.md#4-contas-por-perfil-sem-credenciais)).

| Papel na história | Perfil | Conta | Onde fica aberta |
|---|---|---|---|
| Dona do estúdio, opera tudo | Administrador | Administrador da demo | Notebook, perfil "Admin" do Chrome |
| Recepção | Funcionário administrativo | Bianca Leal | Notebook, janela anônima 1 |
| Professora | Professor | Camila Andrade | Notebook, janela anônima 2 (estreita, para simular o celular) ou o celular após sair do app |
| Cliente A (protagonista) | Cliente | Marina Albuquerque | Notebook, perfil "Cliente" do Chrome (desktop) |
| Cliente B (concorrente) | Cliente | Thiago Bastos | Celular, PWA instalada |

Nomes de telas: a equipe entra pela área administrativa (barra lateral escura, conteúdo claro, itens "Dashboard", "Clientes", "Usuários e perfis", "Agenda", "Reservas", "Planos", "Templates & modalidades", "Fichas de treino", "Metas", "Minhas aulas", "Atribuições", nessa ordem, conforme as permissões); o cliente entra pela área do cliente, toda escura (barra lateral: Home, Agenda, Plano, Ficha de treino, Perfil; no celular, barra inferior com Home, Agenda, Plano, Treino, Perfil).

## Ato 1: Operação (administrador, desktop) — 7 min

Mensagem: "tudo o que o app mostra ao aluno foi configurado aqui, sem programador".

1. **Login.** Tela "Bem-vindo de volta" / "Entre com suas credenciais para continuar." Digite e clique **Entrar**. Você cai em **Dashboard** (o primeiro item do menu). Não explore agora: volte no Ato 6.
   - Plano B: se o login recusar, veja o item 3 de "Antes de começar".
2. **Templates & modalidades.** Abas **Templates de aula** e **Modalidades**. Mostre a lista de templates (nome, modalidade, duração, capacidade, professor padrão) e o template "Personal Studio 1:1" com capacidade 1. Clique em **+ Novo template** para mostrar o formulário (Nome, Descrição, Modalidade, Duração (min), Capacidade, Professor padrão, **Salvar template**) e feche com **Cancelar**.
   - Fale: "a modalidade é o tipo; o template é a aula-modelo com duração, vagas e professor".
3. **Agenda.** Título "Ocorrências / agenda administrativa": grade da semana, chips "HH:MM Modalidade Prof. X · reservas/capacidade". Clique em **+ Nova aula**: escolha um template, veja a opção **Recorrência: Repetir semanalmente**, os dias **SEG TER QUA QUI SEX SÁB DOM** e o resumo "Serão criadas N aulas: ...". Feche sem salvar (**Fechar**).
   - Abra uma aula que já tenha reservas (por exemplo X, "Yoga Vinyasa" de amanhã, ou F): o aviso "Esta aula tem N reservas confirmadas: não pode ser cancelada nem excluída, e horário e duração não podem mudar. A capacidade mínima é N." e os botões **Cancelar aula** e **Excluir aula** desabilitados. Fale: "alterações que quebrariam compromissos de clientes são recusadas".
4. **Usuários e perfis.** Título "Usuários e perfis de acesso", abas **Usuários** e **Perfis de acesso**.
   - Em **Usuários**: a lista com selos de perfil (ADMINISTRADOR, PROFESSOR, FUNCIONÁRIO ADMINISTRATIVO, CLIENTE) e status ATIVO/INATIVO, busca por nome ou e-mail, ações **Desativar/Reativar** e **Excluir** (a exclusão anonimiza e mantém o histórico; não faça agora). A nota "Cada usuário possui exatamente um perfil de acesso."
   - Em **Perfis de acesso**: clique em **Professor**. A "Matriz de permissões — Professor" tem uma linha por módulo, caixas **Visualizar, Criar, Editar, Excluir, Executar**, seletor **Escopo** (Todos os registros, Clientes atribuídos, Aulas atribuídas, Registros próprios) e **Salvar** por linha. Mostre "Presença: Visualizar + Executar, escopo Aulas atribuídas" e "Clientes: Visualizar, escopo Clientes atribuídos". Depois clique em **Cliente** ("O isolamento do Cliente aos próprios registros é fixo e não pode ser alterado.") e em **Administrador** ("O Administrador sempre tem acesso total a todos os módulos — a matriz não pode ser alterada."). **+ Novo perfil** abre o formulário (Nome, Descrição, **Criar perfil**); só mostre, não crie.
   - Fale: "o que cada pessoa vê e faz é decidido por perfil, módulo, ação e escopo, e o servidor confere em cada requisição".
5. **Criar um cliente ao vivo.** Menu **Clientes**, **+ Novo cliente**: abre a página "Novo cliente" (caminho "Clientes / Novo cliente", rota `/clientes/novo`) com Nome completo, E-mail, Telefone, Data de nascimento, CPF, Endereço, Perfil de acesso (só "Cliente" pode ser escolhido aqui) e **Senha inicial** (mínimo 8 caracteres); botões **Cancelar** e **Salvar cliente**. Ao salvar aparece "Cliente cadastrado com sucesso. Voltando para a listagem de clientes…" e a tela volta para **Clientes**. Use o nome reservado para isso no checklist (Renata Vasconcelos) e as instruções de documento fictício.
6. **Planos.** Menu **Planos**, abas **Catálogo de planos** e **Atribuir a cliente**. Em **Atribuir a cliente**: Cliente = Renata, Plano = "Performance", Início e Término, botão **Atribuir plano**; aparece "Plano atribuído a Renata Vasconcelos." Mostre em outro cliente que já tem plano o aviso "... já possui um plano ativo" e o botão **Atribuir e substituir o atual** (o anterior vai para o histórico).
   - Fale: "o plano é informativo no MVP: não bloqueia reservas".
7. **Atribuições** (opcional, 1 min). "Atribuição de clientes a professores": escolha "Camila Andrade" e veja os clientes atribuídos. Fale: "o escopo do professor vem das atribuições e das reservas nas aulas dele".

Plano B do Ato 1: se algo travar na criação ao vivo, mostre o cliente/plano já cadastrados (Larissa Mendonça tem plano atual e histórico) e siga; o Ato 2 não depende da Renata.

## Ato 2: A reserva (cliente, desktop e celular) — 8 min

Mensagem: "o aluno resolve tudo sozinho, e o app é o mesmo no notebook e no celular".

Cliente A no desktop (Marina); a barra lateral escura mostra **Home, Agenda, Plano, Ficha de treino** e **Perfil**. Não há botão "Sair" na barra: a saída é **Sair da conta**, no fim do **Perfil**.

1. **Home.** "Olá, Marina": cartão do plano com selo **ATIVO**, **Próximas aulas** (com os botões **Remarcar** e **Cancelar** em cada reserva), **Sua evolução** (pontos, streak, badges recentes, posição no ranking semanal e o link **Ver gamificação**). A Home não tem bloco de atalhos: a navegação é a barra lateral (ou a inferior, no celular).
2. **Agenda.** Título "Agenda", abas **Próximas** e **Histórico**, navegação **‹ semana ›**. No desktop é a "Grade da semana"; cada chip mostra a modalidade e a lotação ("4/6 vagas", "1/6 · quase lotada", "0/2 · lotada"; "quase lotada" é 25% de vagas ou menos). A grade **não** marca visualmente as aulas que Marina já reservou (o selo "Reservada" saiu; a reserva aparece ao abrir a aula, com o selo **RESERVA CONFIRMADA**, e em **Próximas aulas** na Home). Nota na tela: "Disponibilidade sujeita a confirmação no momento da reserva." Fale: "o que aparece é orientação; a decisão é do servidor".
3. **Reservar (LR).** Clique na aula LR (uma aula com muitas vagas). O detalhe abre como cartão (no celular, como folha inferior): nome do template, "Prof. ..." (primeiro nome), "Duração de N minutos", "N de M vagas restantes". Clique **Reservar**. Resultado: "Reserva confirmada com sucesso. Bom treino!" e botão **Ver na agenda**. Ao reabrir a aula, o detalhe mostra o selo **RESERVA CONFIRMADA** com **Cancelar reserva** e **Remarcar**.
4. **Remarcar com sucesso (LR para LR2).** Na Home, na reserva de LR, clique **Remarcar**. A agenda abre com a faixa "Remarcando {aula} ({dia} às {hora}). Escolha a nova aula na agenda." e o botão **Desistir**. Abra LR2 e clique **Remarcar para esta aula**. Resultado: "Reserva remarcada. Bom treino!". Fale: "a troca é uma única operação: a nova reserva só vale se a antiga saiu; se a nova falhar, a antiga fica" (a prova disso está no Ato 3).
5. **Cancelar até o início da aula.** Ainda na Home, na reserva de LR2, clique **Cancelar** e depois **Confirmar cancelamento**; a aula sai de "Próximas aulas". Pelo detalhe da aula (Agenda), o texto é "Cancelar sua reserva em {aula}, {dia} às {hora}? A vaga será liberada para outros clientes." e o resultado "Reserva cancelada. A vaga foi liberada para outros clientes." Fale: "cancelar não gera ponto nem conta como falta".
6. **Histórico.** Aba **Histórico**: filtro **Todas, Confirmadas, Canceladas, Concluídas, Não compareceu** e as seções "Próximas reservas" e "Anteriores", com selos CONFIRMADA, CANCELADA, CONCLUÍDA e NÃO COMPARECEU. Marina tem duas aulas CONCLUÍDA (Funcional Express) do histórico.
7. **Plano e ficha.** **Plano**: cartão do plano ativo (nome, descrição, Início, Término) e "Histórico de planos". **Ficha de treino** (no celular, **Treino**): "Ficha de treino" com a ficha ativa (título, "Montada por Camila · desde dd/mm/aaaa"; a tela mostra só o primeiro nome do autor, sem "Prof.") e os exercícios com Séries, Repetições, Carga, Tempo, Distância e "Obs. do professor"; abaixo, "Fichas anteriores" (abra uma para ver o detalhe). Fale: "o aluno só lê; quem monta é o professor".
8. **Celular (PWA instalada).** Mostre Thiago no celular, em modo standalone (sem barra do navegador): barra inferior **Home, Agenda, Plano, Treino, Perfil**, chips de dia da semana em vez da grade, o mesmo detalhe da aula em folha inferior e a reserva funcionando. Se quiser, ative o modo avião: aparece "Sem conexão. As ações que precisam de internet ficam indisponíveis até a conexão voltar." com o botão **Verificar conexão**, e **Reservar** fica desabilitado (a PWA guarda só a casca, dados e ações exigem conexão). Desligue o modo avião antes de continuar.
   - Plano B: sem celular, use uma janela do Chrome estreita (menos de 480 px) ou o modo dispositivo do DevTools.

## Ato 3: Cenários de erro — 14 min

Mensagem: "o sistema recusa com o motivo certo, e nunca deixa a agenda quebrar". O backend é a fonte de verdade; a tela só orienta.

Resumo (detalhes nos passos):

| Cenário | Onde é mostrado | Mensagem | Código (HTTP) | Depende de horário? |
|---|---|---|---|---|
| Aula cheia | Agenda do cliente; Reservas administrativas | "Aula lotada" (botão); "Aula cheia. Todas as 2 vagas de Força & Hipertrofia já estão ocupadas. Escolha outro horário."; e na disputa "Essa aula ficou lotada enquanto você confirmava. Escolha outro horário." | `CLASS_FULL` (409) | Não (aulas futuras) |
| Conflito de horário | Agenda administrativa | "O horário se sobrepõe a outra aula — o espaço é exclusivo." | `OCCURRENCE_OVERLAP` (409) | Não |
| Reserva duplicada | Reservas administrativas; duas janelas do mesmo cliente | "Reserva duplicada. Este cliente já possui uma reserva confirmada para esta aula."; "Você já reservou esta aula. Não é possível reservar duas vezes." | `DUPLICATE_RESERVATION` (409) | Não |
| Falta de permissão | Menu e botões da recepção; ação com permissão retirada | Botão desabilitado com dica; "Você não tem permissão para executar esta ação." | `FORBIDDEN` (403) | Não |
| Fora do escopo | Professora abre cliente de outro professor | "Este cliente está fora do seu escopo." | `OUT_OF_SCOPE` (403) | Não |
| Disputa pela última vaga | Dois clientes na mesma aula de 1 vaga | Um confirma; o outro recebe `CLASS_FULL` | 201 e 409 | Não |
| Remarcação recusada | Cliente remarcando para aula que lotou | "Não foi possível remarcar. ... Sua reserva original em ... continua confirmada." | `CLASS_FULL` (409) | Não |
| Cancelar depois do início (bônus) | Home do cliente, aula em andamento | "Não é mais possível cancelar: a aula já começou." | `CANCELLATION_WINDOW_CLOSED` (409) | Sim |

### 3.1 Aula cheia

1. **Cliente (Marina, desktop).** Agenda, dia de amanhã, aula F (Força & Hipertrofia, 2 vagas, as duas ocupadas). O chip mostra "0/2 · lotada"; abra o detalhe: "0 de 2 vagas restantes" e o botão principal é **Aula lotada**, desabilitado. Fale: "o app nem oferece o botão, mas mesmo que oferecesse o servidor recusaria".
2. **Recepção (Bianca).** **Reservas**, **+ Nova reserva** (modal "Nova reserva (administrativa)"). Cliente = Thiago Bastos, Aula = "Força & Hipertrofia — ... (0/2 — lotada)". Aparece o quadro vermelho **"Aula cheia."** "Todas as 2 vagas de Força & Hipertrofia já estão ocupadas. Escolha outro horário." e **Confirmar reserva** fica desabilitado. Essa recusa vem do próprio servidor (mesma regra da reserva de verdade). Clique **Voltar**.
3. A mensagem crua do servidor ("Essa aula ficou lotada enquanto você confirmava. Escolha outro horário.") aparece na disputa (3.6).

### 3.2 Conflito de horário

1. **Administrador, Agenda.** **+ Nova aula**: template "Funcional Intenso", data de amanhã, horário **14:10** (a aula R1 de amanhã vai das 14h00 às 14h50). Clique **Salvar**. Quadro vermelho: "O horário se sobrepõe a outra aula — o espaço é exclusivo." com a lista das aulas em conflito ("Personal Studio 1:1 · 14h00–14h50 (qua 01/10)", no formato "dia da semana dd/mm"). Feche com **Fechar**.
2. Fale: "o estúdio é um espaço exclusivo: duas aulas nunca se sobrepõem, garantido pelo banco de dados mesmo com duas pessoas criando ao mesmo tempo (a criação recorrente é tudo ou nada e lista todas as datas em conflito)".
3. **Não prometa** o conflito do lado do cliente ("duas reservas do mesmo cliente em horários sobrepostos", `SCHEDULE_CONFLICT`, "Você já tem uma reserva em {aula} às {hh}h{mm}, no mesmo horário desta aula."). O motor de reserva implementa e testa a regra, mas como duas aulas agendadas nunca se sobrepõem, ela não pode ser disparada pela interface. Diga isso com naturalidade: "essa segunda barreira existe para o dia em que houver mais de um espaço".
   - Plano B: se o horário 14:10 estiver livre por engano (R1 não foi criada), escolha qualquer horário que caia dentro de uma aula da grade (por exemplo 07:30 numa segunda, quarta ou sexta).

### 3.3 Reserva duplicada

1. **Recepção (Bianca), Reservas, + Nova reserva.** Cliente = Marina Albuquerque, Aula = X ("Yoga Vinyasa", amanhã 17h00, onde Marina já tem reserva). Quadro vermelho: **"Reserva duplicada."** "Este cliente já possui uma reserva confirmada para esta aula." Clique **Voltar**.
2. **Com a tela do cliente (duas janelas da Marina).** Nas duas janelas do perfil "Cliente", abra o detalhe de LR (ainda sem reserva). Na janela 1 clique **Reservar** ("Reserva confirmada com sucesso. Bom treino!"). Na janela 2, que ainda mostra **Reservar**, clique nele: "Você já reservou esta aula. Não é possível reservar duas vezes." com o botão **Ver minha reserva**. Fale: "cada tentativa tem uma chave de idempotência; repetir a mesma tentativa nunca cria uma segunda reserva, e uma tentativa diferente é recusada com o motivo".
   - Depois, cancele a reserva de LR (Home, **Cancelar**, **Confirmar cancelamento**) para deixar o estado como estava.

### 3.4 Falta de permissão

1. **Bianca (Funcionário administrativo).** Mostre o que ela **não** tem: o menu não traz "Usuários e perfis"; em **Agenda** o botão **+ Nova aula** está desabilitado (dica "Você não tem permissão para criar aulas."); em **Clientes**, abra um cliente: **Excluir cliente** desabilitado ("Você não tem permissão para excluir clientes."). No celular não há dica ao passar o mouse: use o notebook.
2. **O servidor é a fonte de verdade (com o copiloto).** Bianca deixa aberta a tela **Reservas** (Período = **Todas**) com a reserva descartável S de Thiago visível e o botão **Cancelar** ativo. O administrador vai em **Usuários e perfis**, **Perfis de acesso**, **Funcionário administrativo**, desmarca **Editar em Reservas** e clica **Salvar** naquela linha. Bianca, **sem recarregar**, clica **Cancelar** na reserva S e **Confirmar cancelamento**: o quadro vermelho mostra **"Você não tem permissão para executar esta ação."** (o servidor lê a permissão a cada requisição, sem cache). Bianca recarrega a página: agora os botões de alterar reserva aparecem desabilitados ("Você não tem permissão para alterar reservas.").
3. **Restaure**: administrador marca **Editar em Reservas** de novo e clica **Salvar**. Refaça a reserva S de Thiago (checklist) se ela foi cancelada.
   - Plano B: sem copiloto, faça a alteração e o clique em duas janelas do mesmo notebook (perfil "Admin" e janela anônima da Bianca). Se o clique não falhar, a permissão não foi salva: confira o **Salvar** da linha.

### 3.5 Operação fora do escopo autorizado

1. **Professora Camila.** Ela entra no **Dashboard** e o menu traz só o que o perfil permite (Dashboard, Clientes, Agenda, Fichas de treino, Metas, Minhas aulas). Em **Clientes** aparecem só os clientes dela (Marina, Thiago, Beatriz, Larissa). Compare com o administrador: são 9 clientes.
2. O administrador abre o cliente **Gustavo Farias** (aluno só do professor Rafael) e copia o endereço da página (`/clientes/<id>`). Cole na janela da Camila. Resultado: link "← Clientes" e o erro **"Este cliente está fora do seu escopo."** com **Tentar novamente**. Fale: "o professor só enxerga alunos das aulas dele e os que a administração atribuiu".
3. Variante: cole `/presenca/<id de uma aula do Rafael>` (o administrador abre **Minhas aulas**, que para ele lista as aulas de todos os professores, clica numa aula do Rafael e copia o endereço, que termina em `/presenca/<id>`). A tela mostra "Não foi possível carregar a lista de presença." (o servidor respondeu 403 `OUT_OF_SCOPE`: "Você só pode registrar presença nas aulas em que é o professor.").
   - Plano B: sem o endereço à mão, mostre o Dashboard dos dois lado a lado: "Clientes ativos" é 4 para Camila e 9 para o administrador (os blocos do dashboard respeitam o escopo de cada módulo).

### 3.6 Disputa pela última vaga (dois clientes ao mesmo tempo)

Preparação: aula R1 (Personal Studio 1:1, 1 vaga, amanhã 14h00, sem reservas). Marina no desktop, Thiago no celular (PWA).

1. As duas telas abrem o detalhe de R1: ambas mostram "1 de 1 vagas restantes" e **Reservar**. **Não troque de aba nem de janela no desktop** depois de abrir o detalhe (a tela reconsulta a disponibilidade ao voltar o foco e mostraria "Aula lotada" antes do clique).
2. Contagem "3, 2, 1" e os dois clicam **Reservar** (ou o copiloto toca no celular e, logo em seguida, o apresentador clica no desktop).
3. Resultado: exatamente um recebe "Reserva confirmada com sucesso. Bom treino!"; o outro recebe o quadro vermelho **"Essa aula ficou lotada enquanto você confirmava. Escolha outro horário."** e o botão **Ver outros horários**. O vencedor pode ser qualquer um; o servidor trava a aula, decide um por um e o segundo já encontra a vaga ocupada.
4. Mostre na **Agenda** que a R1 passou a "0/1 · lotada" e, na tela **Reservas** do administrador, a reserva do vencedor (Registro: "Criada por Thiago Bastos (cliente)").
   - Plano B: se a tela do desktop atualizou sozinha e já mostra **Aula lotada**, inverta os papéis (Thiago abre R2 primeiro) ou use dois perfis do Chrome no mesmo notebook. Para repetir, a equipe cancela a reserva vencedora em **Reservas** (**Cancelar**, **Confirmar cancelamento**).

### 3.7 Remarcação recusada preserva a reserva original

Preparação: Marina tem reserva em X ("Yoga Vinyasa", amanhã 17h00). Aula R2 (Personal Studio 1:1, 1 vaga, amanhã 15h00, sem reservas).

1. Marina (desktop): Home, **Remarcar** na reserva de Yoga Vinyasa. A agenda mostra a faixa "Remarcando Yoga Vinyasa (... às 17h00). Escolha a nova aula na agenda." Abra R2: "1 de 1 vagas restantes" e o botão **Remarcar para esta aula**. **Não clique ainda.**
2. Thiago (celular): abre R2 e clica **Reservar** ("Reserva confirmada com sucesso. Bom treino!"). A vaga acabou.
3. Marina clica **Remarcar para esta aula**. Resultado: "Não foi possível remarcar. Essa aula ficou lotada enquanto você confirmava. Escolha outro horário. Sua reserva original em Yoga Vinyasa, {dia} às 17h00 continua confirmada.", o selo **RESERVA ORIGINAL ATIVA** e o botão **Tentar remarcar novamente**.
4. Prove: clique **Tentar remarcar novamente**, vá à **Home** e mostre a Yoga Vinyasa ainda em "Próximas aulas". Depois, no administrador, **Reservas** mostra a reserva de Marina em X como CONFIRMADA. Fale: "a troca é atômica: se a nova falha, nada muda para o cliente".
   - Plano B: igual ao 3.6 (sem celular, use dois perfis do Chrome no notebook, um para Marina e outro para Thiago; se a tela da Marina já mostrar "Aula lotada" antes do clique, refaça a preparação com a R2 de outro dia). Para repetir, cancele a reserva do Thiago em R2 em **Reservas**.

### 3.8 Bônus: cancelar depois do início da aula

Só se houver uma aula em andamento (PR, a aula-relâmpago, ou P durante a aula). Na Home da cliente que tem reserva nela, **Cancelar** e **Confirmar cancelamento**: "Não é mais possível cancelar: a aula já começou." Fale: "cancelamento vai até o início da aula". Plano B: pule; a regra está coberta por testes.

## Ato 4: Presença (professora, celular) — 5 min

Mensagem: "o professor registra a presença com um toque e a pontuação nasce daí".

1. **Professora Camila** no celular (ou janela estreita). Menu **Minhas aulas** (eyebrow "Presença"), abas **Hoje** e **Semana**. A aula P ("Pilates Reformer", 08h00 de hoje) aparece com "0 de 3 registrados" e o selo "3 pendentes" (antes do início da aula o selo mostra "3 reservas").
2. Toque na aula. Tela cheia **Presença**: subtítulo "Pilates Reformer · Hoje, 08h00", "0 de 3 registrados", "Toque para marcar", a nota "Somente o professor atribuído a esta aula pode registrar presença." e uma linha por cliente com **PENDENTE** e os botões **Presente** e **Faltou**.
3. Toque **Presente** em Marina e em Thiago e **Faltou** em Beatriz. As linhas mudam na hora (não há botão salvar); o contador vai a "3 de 3 registrados". Fale: "presente conclui a reserva; faltou vira 'não compareceu' e reinicia o streak".
4. Correção (opcional): toque **Presente** em Beatriz e depois **Faltou** de novo; no histórico dela (Sua evolução) e na aba **Gamificação** do cliente, para a equipe, aparece "Correção de presença" com pontos negativos (o servidor estorna e recalcula streak e badges).
5. Se a aula ainda **não começou**, a tela mostra "A presença abre no início da aula, às 08h00." e os botões ficam desabilitados; se o servidor recusar, "A presença só abre a partir do início da aula." (`ATTENDANCE_NOT_OPEN`, 409). Fale: "a presença é só depois que a aula começa".

**Plano B (a presença só abre depois do início da aula):**

1. **Se P ainda não começou** (demo mais cedo que o previsto): use PR, a aula-relâmpago do dia (checklist, "Aulas de cena"), criada 30 minutos antes da demo para começar durante o Ato 3. Quando o Ato 4 chegar ela já começou.
2. **Se nem P nem PR estiverem disponíveis:** mostre a tela de uma aula que ainda não começou (mensagem "A presença abre no início da aula ...", botões desabilitados) e depois abra uma aula já registrada do histórico em **Minhas aulas**, aba **Semana** (as aulas-relâmpago "Funcional Express" de ontem, se caírem na mesma semana): a lista mostra "Tudo registrado" e dá para corrigir uma marcação (Presente para Faltou e volta) para mostrar o estorno de pontos.
3. **Se o relógio do servidor estiver diferente do seu:** o botão habilita e o servidor recusa com "A presença só abre a partir do início da aula." Use PR ou o item 2.

## Ato 5: Gamificação (cliente) — 5 min

Mensagem: "cada presença vira pontos, sequências viram conquistas, e o ranking mantém o aluno voltando".

1. **Marina** (desktop ou celular), **Home**, bloco **Sua evolução**: pontos, sequência ("3 dias seguidos de treino"), **Badges recentes** (um disco com o ícone de conquista por badge; o de "Streak de 3 dias" aparece aqui, sem texto visível) e "2º lugar no ranking semanal". Se a Home não atualizou, navegue até outra tela e volte.
2. **Ver gamificação.** Título **Sua evolução**: "35 pontos totais", marcos **3 dias, 5 dias, 10 dias** (o de 3 alcançado), "Próximo marco: 5 dias (+10 pontos)", **Conquistas** ("Streak de 3" conquistado; "Streak de 5 (3/5)" e "Streak de 10 (3/10)" bloqueados), **Histórico recente** ("Presença confirmada · Pilates Reformer +10", "Streak de 3 dias consecutivos +5"), **Metas do professor** e **Ranking**.
3. **Ranking.** Abas **Semanal** e **Mensal**. Marina aparece como "2º Marina (você) · 3 presenças · empate" junto com Otávio R. e Larissa M. em 1º. Fale as regras (configuradas no banco, não no código): presença 10 pontos; meta concluída 25; streak de 3, 5 e 10 presenças seguidas dá badge e bônus de 5, 10 e 20 pontos; faltar reinicia o streak; cancelar não pontua nem conta como falta; ranking soma pontos do período (semana de segunda a domingo, ou mês); empate resolvido por mais presenças e, se persistir, mesma posição ("empate"). Os outros aparecem como "Ana P." (primeiro nome e inicial).
4. **Meta concluída ao vivo (opcional, sobe o placar).** Camila, menu **Metas**, escolhe **Marina Albuquerque**, na meta ativa clica **Concluir** e depois **Confirmar** ("Concluir a meta e dar os pontos ao aluno?"). Marina passa a ter 60 pontos e, na tela dela, "Metas do professor" mostra a meta como "Concluída em dd/mm/aaaa" e o histórico "Meta concluída · {título} +25". Com 60 pontos e 3 presenças ela empata com Larissa em 1º.
   - Plano B: se a Home ou a tela de gamificação mostrarem "Nenhum ganho de pontos ainda." ou "Ninguém pontuou neste período ainda.", confirme se as marcações do Ato 4 foram feitas e, se for segunda-feira, use a aba **Mensal** (o ranking semanal recomeça toda segunda).

## Ato 6: Dashboard (administrador) — 3 min

Mensagem: "a dona do estúdio enxerga ocupação e engajamento em uma tela".

1. **Administrador**, **Dashboard**. Blocos:
   - **Cartões de indicadores** no topo: **Clientes ativos** (9, inclui a Renata criada no Ato 1), **Ocupação média da semana**, **Pontos distribuídos no mês** e **Streaks ativos**.
   - **Ocupação por aula · semana atual**: uma barra por aula com o percentual de ocupação. Mostre F (lotada, 100%) e R1/R2.
   - **Gamificação**: **pontos distribuídos**, **streaks ativos** e o **Ranking do período** (o mês atual; os 3 primeiros, com "N presenças"). Não há abas Semana/Mês no Dashboard: os números do período são sempre os do mês.
2. Compare com a **Camila**: o mesmo Dashboard mostra só as aulas e os clientes dela (Clientes ativos = 4). Fale: "o mesmo produto, escopo diferente por perfil".
3. Feche o ciclo: o que o professor marcou no Ato 4 já está aqui em presenças, pontos e ranking.
   - Plano B: se os números do Dashboard não baterem com o que você esperava (semana virou, aulas em outra semana), lembre que o Dashboard mostra o mês atual para pontos, streaks e ranking, e a semana atual para a ocupação; confira a seção 16 do checklist.

## Encerramento (2 min)

Recapitule os oito critérios do "Critério de transição para piloto" com o que o decisor viu:

| Critério (`mvp-web-pwa.md`) | Onde foi mostrado |
|---|---|
| Fluxos principais funcionais | Atos 1 a 6 |
| Testes mínimos verdes | Fora da tela: CI verde na versão implantada (verificação do ensaio) |
| Ambiente remoto acessível por URL | A demo inteira roda na URL da Vercel |
| Reset técnico funciona | Antes da demo (véspera): `pnpm demo:reset`, ver [runbook](deploy-runbook.md) seção 9 |
| Administrador cria usuários e permissões | Ato 1, passos 4 e 5 (clientes pela tela; equipe pela API, ver "O que não prometer") |
| Cliente simulado completa o fluxo de reserva | Ato 2 |
| Professor registra presença | Ato 4 |
| Gamificação reflete os eventos | Ato 5 e Ato 6 |
| Interface responsiva em desktop e mobile | Ato 2 (passo 8) e Ato 4 |

Feche com o pedido: aprovação para iniciar o piloto real (que só começa depois do decisor aprovar e dos requisitos mínimos de segurança, `mvp-web-pwa.md`).

## Depois de cada ensaio ou demo

O que se desfaz e o que não se desfaz:

- **Reservas** (R1, R2, LR, LR2, S): cancelam-se em **Reservas** (filtro **Período: Todas**), **Cancelar**, **Confirmar cancelamento**; a vaga volta. Recadastre a reserva S (Thiago) e mantenha a X (Marina).
- **Permissão** retirada no 3.4: restaure e **Salvar**.
- **Presença** e **meta concluída** não voltam para "pendente": a marcação só alterna entre Presente e Faltou e os pontos ficam no histórico. Para repetir a demo do zero, rode o reset e recadastre a massa (é o procedimento da véspera).
- **Ensaio antes da véspera**: use a aula PR (ela pode ser repetida criando outra aula-relâmpago) e evite concluir a meta da Marina; o ensaio final deve ser feito com o estado que o reset e o checklist produzirem.

## O que não prometer (limites reais do MVP)

Diga só o que o produto faz hoje:

- **Conflito de horário do cliente não se dispara pela tela.** O estúdio tem espaço exclusivo (duas aulas agendadas nunca se sobrepõem, restrição no banco); por isso a regra `SCHEDULE_CONFLICT` do motor de reserva só é exercitada nos testes automatizados. Na demo, o conflito mostrado é o da agenda (`OCCURRENCE_OVERLAP`).
- **Contas de equipe não são criadas pela tela.** A tela cria clientes (**+ Novo cliente**, página "Novo cliente"); professores e funcionários exigem a API (`POST /api/users/staff`, ver checklist, seção 7), e não há tela para trocar o perfil de um usuário nem redefinir senha.
- **"Aula cheia" no cliente aparece como botão desabilitado**, não como erro; a mensagem de erro só surge quando a tela está desatualizada (disputa) ou na recepção, que mostra a prévia do servidor.
- **O ranking do cliente mostra presenças e "empate", não os pontos de cada colega.** A equipe vê o total de pontos distribuídos no Dashboard (e o ranking do mês por presenças), não a pontuação de cada aluno nessa tela.
- **Permissões só chegam à tela ao recarregar.** O servidor aplica a mudança na hora; uma sessão aberta mantém os botões antigos até recarregar (é o que o cenário 3.4 usa).
- **A tela chama de "dias" o que a regra conta como presenças seguidas** ("3 dias seguidos de treino", "Streak de 3 dias consecutivos"). Se perguntarem: são três presenças consecutivas.
- **Sem notificações, pagamentos, recuperação de senha, cadastro público ou app nativo** (fora do escopo do MVP). A PWA guarda só a casca: sem internet não há dados nem ações.
- **Ícone da PWA no iPhone:** o app declara só um ícone SVG (`flame.svg`), e o Safari costuma ignorar SVG no ícone da tela inicial. Confira no aparelho que será usado; se sair genérico, mostre a PWA no Android ou no desktop.
