# Exportações em CSV

Contrato comum das exportações CSV da API (#82 ocupação, #83 reservas e #84 presenças usam a mesma base). Código em `packages/api/src/exports/`.

## Contrato comum

- **Codificação:** UTF-8 com BOM (`EF BB BF`), para o Excel abrir com acentuação certa.
- **Delimitador:** `;`. **Quebra de linha:** CRLF, inclusive depois da última linha.
- **Escape:** campo com `;`, `"`, CR ou LF vai entre aspas, e aspas internas são dobradas (`""`).
- **Proteção contra fórmula:** texto que começa com `=`, `+`, `-`, `@`, TAB ou CR ganha `'` na frente. Vale também para os cabeçalhos. Números não recebem prefixo.
- **Números:** vírgula decimal (`87,5`). Valor `null` vira campo vazio. `NaN` e `Infinity` são erro.
- **Sem truncamento:** nenhuma exportação usa `take`, paginação ou limite de tamanho. O que limita as linhas é o período.
- **Período:** datas locais inclusivas (`from`, `to`, `YYYY-MM-DD`). Ocupação, reservas e presenças usam a data inicial da ocorrência; pedidos usam a data de criação. O filtro vai de `from` 00h00 até `to + 1` 00h00 (fim exclusivo), em `America/Sao_Paulo`. Use `resolveExportPeriod` (`export-period.ts`); ele devolve os limites em UTC.
- **Limite:** 92 dias, inclusive (`EXPORT_PERIOD_MAX_DAYS`, em `@fitburn/contracts`).
- **Erros** (envelope padrão `{ code, message, details? }`):
  - Data malformada ou ausente: 400 `VALIDATION_ERROR`, com o campo em `details.fieldErrors`.
  - `from` depois de `to`: 400 `VALIDATION_ERROR`, "A data inicial não pode ser posterior à data final.".
  - Período acima de 92 dias: 400 `VALIDATION_ERROR`, "O período máximo da exportação é de 92 dias.".
  - Sem token: 401. Sem permissão: 403 `FORBIDDEN`. Escopo insuficiente para o módulo: 403 `OUT_OF_SCOPE`.
- **Resposta:** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="..."` (nome só com ASCII seguro) e `Cache-Control: no-store` (global da API).
- **Dados pessoais:** ocupação, reservas e presenças não incluem dados de pessoas nem IDs de reserva ou cliente. Pedidos incluem o nome do cliente, conforme a permissão de leitura da Loja; não incluem contato, documento, senha, token nem IDs internos de cliente ou item. Os testes conferem os dados presentes em cada exportação.

## Ocupação (`GET /api/exports/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD`)

- **Permissão:** `OCORRENCIAS:VIEW` mais `occurrenceScopeFilter`, o mesmo escopo de `GET /api/occurrences`.
- **Arquivo:** `ocupacao_<from>_<to>.csv`.
- **Linhas:** uma por ocorrência do período, inclusive canceladas e sem reservas, em ordem de início.

| Coluna | Conteúdo |
| --- | --- |
| `ocorrencia_id` | ID da ocorrência (não de reserva nem de cliente) |
| `aula` | Nome da aula |
| `data_local` | Data local, `YYYY-MM-DD` |
| `hora_local` | Hora local, `HH:mm` |
| `situacao` | `AGENDADA` ou `CANCELADA` |
| `capacidade` | Capacidade da ocorrência |
| `vagas_ocupadas` | Reservas com status diferente de `CANCELLED` (`CONFIRMED`, `COMPLETED`, `NO_SHOW`) |
| `vagas_disponiveis` | `max(0, capacidade − vagas_ocupadas)` |
| `ocupacao_percentual` | `vagas_ocupadas ÷ capacidade × 100`, uma casa decimal. Capacidade zero deixa a célula vazia. Não é limitado a 100%. |

## Reservas (`GET /api/exports/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD`)

- **Permissão:** `RESERVAS:VIEW`, e **só escopo total** (`ALL`). Qualquer outro escopo recebe 403 `OUT_OF_SCOPE`, antes de qualquer consulta ao banco. O motivo: cada linha é um agregado por ocorrência; com escopo parcial, a contagem mostraria só parte das reservas e um "0" que não é real. Por isso não usa `occurrenceScopeFilter`.
- **Arquivo:** `reservas_<from>_<to>.csv`.
- **Linhas:** uma por ocorrência do período, inclusive canceladas e sem reservas (contagens zeradas), em ordem de início.

| Coluna | Conteúdo |
| --- | --- |
| `ocorrencia_id` | ID da ocorrência (não de reserva nem de cliente) |
| `aula` | Nome da aula |
| `data_local` | Data local, `YYYY-MM-DD` |
| `hora_local` | Hora local, `HH:mm` |
| `situacao` | `AGENDADA` ou `CANCELADA` (situação da ocorrência) |
| `confirmadas` | Reservas `CONFIRMED` |
| `canceladas` | Reservas `CANCELLED` |
| `concluidas` | Reservas `COMPLETED` |
| `nao_compareceu` | Reservas `NO_SHOW` |
| `vagas_ocupadas` | `confirmadas` + `concluidas` + `nao_compareceu`. Canceladas não ocupam vaga. |

## Presenças (`GET /api/exports/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`)

- **Permissão:** `PRESENCA:VIEW` mais `occurrenceScopeFilter`, o mesmo escopo de `GET /api/attendance/classes`. Escopo total vê todas as aulas; `ASSIGNED_CLASSES` e `OWN` veem só as aulas do próprio professor, com as contagens delas. Escopo que não se aplica a aulas (ex.: clientes atribuídos) recebe 403. Não exige escopo total, diferente de reservas: cada linha é uma aula inteira, então a contagem é completa para quem a enxerga.
- **Arquivo:** `presencas_<from>_<to>.csv`.
- **Linhas:** uma por ocorrência do período, inclusive canceladas e sem reservas (contagens zeradas), em ordem de início.
- **Mapeamento:** pelo status atual da reserva, sem histórico. `CONFIRMED` é pendente (ainda sem registro) e nunca vira falta. `CANCELLED` não entra em nenhuma coluna, porque cancelamento não é ausência. Correção de presença (`COMPLETED` ↔ `NO_SHOW`) só muda o status, então o arquivo reflete o estado atual.

| Coluna | Conteúdo |
| --- | --- |
| `ocorrencia_id` | ID da ocorrência (não de reserva nem de cliente) |
| `aula` | Nome da aula |
| `data_local` | Data local, `YYYY-MM-DD` |
| `hora_local` | Hora local, `HH:mm` |
| `situacao` | `AGENDADA` ou `CANCELADA` (situação da ocorrência) |
| `presentes` | Reservas `COMPLETED` |
| `faltas` | Reservas `NO_SHOW` |
| `pendentes` | Reservas `CONFIRMED`: ainda sem presente nem falta registrados |

## Passo a passo para plugar uma nova exportação

Só a consulta muda. Serialização, período, resposta e escopo já existem.

1. **Contrato** (`packages/contracts/src/exports.ts`): adicione a lista de colunas da nova exportação, no mesmo formato de `OCCUPANCY_EXPORT_COLUMNS`. Rode `pnpm --filter @fitburn/contracts build`.
2. **Consulta** (`packages/api/src/exports/<nome>-export.service.ts`): copie `occupancy-export.service.ts`. Mantenha `resolveExportPeriod` como entrada, `startsAt: { gte, lt }` no `where`, `...occurrenceScopeFilter(requester)` quando a consulta for de aulas, sem `take`/`skip`, e `select` só com os campos da coluna. Separe a linha em uma função pura (como `occupancyCsvRow`) e teste essa função.
3. **Controller** (`<nome>-export.controller.ts`): copie `occupancy-export.controller.ts`. Troque a rota, a permissão do módulo e o nome do arquivo. Use `@Query(new ZodValidationPipe(dateRangeQuerySchema))`, `resolveExportPeriod` e `sendCsv`.
4. **Módulo:** registre o controller e o serviço em `exports.module.ts`. `ExportsModule` já está em `app.module.ts`.
5. **Testes:**
   - Unitário da função pura e de qualquer regra nova.
   - E2E em `packages/api/test/<nome>-export.e2e-spec.ts`, seguindo `exports-occupancy.e2e-spec.ts`. Use `asBinary` e `parseCsv` de `csv-test-utils.ts`: o parser é independente do serializador. Confira BOM, cabeçalho, 401/403, período, escopo e os dados pessoais previstos para a exportação.
6. **Web:** a tela usa `packages/web/src/lib/exports/download-csv.ts` e `components/ExportCsvButton.tsx` (criados na subtarefa web da #82). Passe a rota, os parâmetros e o nome do arquivo.

## Pedidos da Loja (`GET /api/exports/shop-orders?from=YYYY-MM-DD&to=YYYY-MM-DD`)

- **Permissão:** `LOJA:VIEW`, com escopo total (`ALL`), como a listagem administrativa de pedidos.
- **Arquivo:** `pedidos_<from>_<to>.csv`.
- **Linhas:** uma por item do pedido, em ordem de criação do pedido e do item. Os dados do pedido se repetem nas linhas de seus itens.
- **Data:** data local da criação do pedido (`America/Sao_Paulo`); as datas são inclusivas.
- **Valores:** preços unitários, subtotais e total do pedido são expressos em reais e formatados pelo serializador comum.
- **Dados pessoais:** a coluna `Cliente` contém o nome que consta no pedido. E-mail, documento e IDs internos não são exportados.

| Coluna | Conteúdo |
| --- | --- |
| `Pedido` | Número curto do pedido |
| `Data` | Data local de criação, `YYYY-MM-DD` |
| `Cliente` | Nome do cliente |
| `Status` | Estado atual do pedido |
| `Produto` | Nome do produto no momento do pedido |
| `Variação` | Rótulo da variação no momento do pedido; vazio para produto sem opções |
| `Quantidade` | Unidades daquele item |
| `Preço unitário` | Preço unitário em reais |
| `Subtotal` | Subtotal do item em reais |
| `Total do pedido` | Total do pedido em reais, repetido em cada item |

Não reimplemente formatação, escape, fuso ou limite de período dentro de uma nova exportação. Se faltar algo na parte comum, mexa no módulo comum e cubra com teste.
