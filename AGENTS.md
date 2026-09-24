# AGENTS.md

Instruções para qualquer agente (Claude Code, Codex, etc.) que trabalhe neste repositório.

O ciclo de toda mudança de código é:

```text
/implement  →  revisão (/code-review + testes)  →  aprovado?  ──sim──→  abrir PR
                        ↑                              │
                        └──── corrigir (não, até 5) ←──┘
```

## 1. Implementação: sempre pela skill `/implement`

Sempre que a tarefa for **implementar** algo, você deve executá-la pelo fluxo da skill `implement` do Matt Pocock. Não há exceção por tamanho: uma função pequena, um ajuste de uma linha ou uma correção de bug também contam. As correções pedidas por uma revisão também são implementação.

"Implementar" é qualquer tarefa que crie ou altere código de produção, testes, schema do banco (Prisma), migrations, configuração de build ou infraestrutura como código.

Não contam como implementação: responder perguntas, pesquisar, planejar, revisar código e editar apenas documentação (`docs/`, `README.md`, `CONTEXT.md`).

### Antes de começar

- A skill trabalha a partir de uma spec ou de tickets. Se a tarefa não tiver uma spec clara, procure em `docs/`. Se ainda assim faltar definição, pergunte antes de escrever código. Anote o caminho da spec usada: a revisão vai precisar dele.
- Use os termos do domínio definidos em `CONTEXT.md` (reserva, disponibilidade, conflito de reserva, solicitação repetida).
- Trabalhe numa branch própria, criada a partir da branch padrão (`main`). Se estiver na `main`, crie `feat/<slug>` ou `fix/<slug>` antes de alterar qualquer arquivo.
- Se o diretório não for um repositório git, não rode `git init` por conta própria: avise o usuário e pergunte como seguir.

## 2. Revisão: sempre pela skill `/code-review`

Toda revisão de código usa a skill `code-review` do Matt Pocock, sem exceção. Não substitua por uma revisão livre, por outra skill de revisão nem por uma leitura rápida do diff.

Ao rodar a skill:

- **Ponto fixo:** use a branch padrão (`main`), para que cada revisão cubra o diff inteiro da branch e não só a última correção.
- **Spec:** passe o caminho da spec usada na implementação. O eixo Spec não pode ser pulado; se nenhuma spec for encontrada, a revisão está bloqueada e você deve perguntar ao usuário.
- **Quem revisa não corrige.** Se o revisor for um agente separado do implementador, ele só devolve o feedback. As correções voltam para o implementador, que as faz pelo fluxo da seção 1.

## 3. Loop de revisão: no máximo 5 iterações

Uma **iteração** é uma rodada de revisão completa sobre o código atual da branch:

1. rodar o typecheck;
2. rodar a suíte completa de testes;
3. rodar `/code-review` (eixos Standards e Spec).

O `/code-review` que a skill `implement` executa ao final conta como a iteração 1. Não rode outra revisão em seguida sem que o código tenha mudado.

### Critério de aprovação

A iteração **aprova** somente se todas as condições forem verdadeiras:

- o typecheck passa;
- todos os testes passam;
- o eixo **Spec** não tem nenhum achado: nada faltando ou parcial, nada implementado errado e nada fora do escopo pedido;
- o eixo **Standards** não tem nenhuma violação de padrão documentado do repositório.

Os code smells da lista base do `/code-review` são sempre julgamento, não violação. Sozinhos, não reprovam a iteração: corrija-os ou justifique cada um no PR.

Qualquer outra situação **reprova** a iteração.

### Fluxo

- **Aprovou:** vá para a seção 4 e abra o PR.
- **Reprovou e ainda não chegou à iteração 5:** o implementador corrige todos os achados bloqueantes pelo fluxo da seção 1, commita e uma nova iteração começa.
- **Reprovou na iteração 5:** **pare.** Não faça mais correções e não abra PR. Entregue ao usuário o histórico das 5 iterações e os achados que continuam em aberto, para que ele decida o próximo passo.

### Registro das iterações

Mantenha o histórico em `.scratch/review-log/<nome-da-branch>.md` (não commitar). Assim a contagem sobrevive a trocas de agente ou de sessão. Para cada iteração, registre:

- número da iteração e hash do commit revisado;
- resultado do typecheck e dos testes;
- achados de Spec e de Standards;
- decisão (aprovada ou reprovada) e, se reprovada, o que foi corrigido em seguida.

Antes de começar uma iteração, leia esse arquivo para saber em qual número você está.

## 4. Após a aprovação: abrir o PR

Toda iteração aprovada termina com um pull request. Não é opcional.

1. Confirme que todo o trabalho está commitado na branch.
2. Faça push da branch para o remoto.
3. Abra o PR contra a branch padrão com `gh pr create`.
4. **Não faça merge.** O merge é decisão do usuário.

O corpo do PR deve conter:

- **Resumo:** o que mudou, usando os termos de `CONTEXT.md`;
- **Spec:** o caminho ou link da spec implementada;
- **Verificação:** resultado do typecheck e da suíte completa de testes na iteração aprovada;
- **Histórico de revisão:** quantas iterações foram necessárias e, para cada iteração reprovada, os principais achados e como foram corrigidos;
- **Smells aceitos:** cada smell apontado pelo `/code-review` que não foi corrigido, com a justificativa.

Se não houver remoto configurado ou o `gh` não estiver autenticado, não contorne: avise o usuário e informe que a branch está pronta para o PR.

## 5. Como carregar as skills

A skill `implement` vem com a invocação automática desligada (`disable-model-invocation: true` no Claude Code e `allow_implicit_invocation: false` no Codex). Por isso, se o usuário não digitou `/implement`, você não consegue chamá-la pela ferramenta de skills. A `code-review` e a `tdd` podem ser invocadas normalmente, mas o mesmo procedimento vale se isso falhar:

1. Leia o `SKILL.md` da skill no primeiro caminho que existir:
   - `~/.agents/skills/<skill>/SKILL.md`
   - `~/.codex/skills/<skill>/SKILL.md`
   - `~/.claude/plugins/cache/mattpocock/mattpocock-skills/*/skills/engineering/<skill>/SKILL.md` (use a versão mais recente)
2. Siga o arquivo à risca, como se o usuário tivesse digitado o comando.

Se não encontrar o `SKILL.md` de uma skill obrigatória (`implement` ou `code-review`), **pare e avise o usuário**. Não improvise um fluxo parecido.

## 6. Relatório final obrigatório

Ao terminar o ciclo, seja com PR aberto ou parado na iteração 5, informe:

- de onde as skills `implement` e `code-review` foram carregadas (comando digitado ou caminho do `SKILL.md` lido);
- em quais seams usou TDD e onde optou por não usar, com o motivo;
- quantas iterações de revisão houve e o resultado de cada uma;
- o resultado do typecheck e da suíte completa na última iteração;
- o link do PR ou, se não houve PR, o motivo e os achados em aberto.

Um ciclo sem esse relatório está incompleto.

## Agent skills

### Issue tracker

Issues e specs ficam no GitHub Issues de `GuilhermeFaglioni/fitburn`, via `gh`. Veja `docs/agents/issue-tracker.md`.

### Triage labels

Rótulos padrão: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Veja `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` e `docs/adr/` na raiz. Veja `docs/agents/domain.md`.
