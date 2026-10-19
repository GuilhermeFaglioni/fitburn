# API de saúde

Todos os endpoints de saúde são públicos e não exigem autenticação.

## Liveness

`GET /api/health/live` confirma que o processo da API consegue responder. O endpoint não consulta o PostgreSQL.

Resposta: HTTP `200`.

```json
{
  "status": "ok",
  "timestamp": "2026-10-19T18:00:00.000Z"
}
```

## Readiness

`GET /api/health/ready` consulta o PostgreSQL com `SELECT 1`. Retorna HTTP `200` apenas quando a consulta termina com sucesso em até 1 segundo. Falha de conexão ou timeout retorna HTTP `503`.

`GET /api/health` permanece como alias de readiness para compatibilidade.

Resposta pronta: HTTP `200`.

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-19T18:00:00.000Z"
}
```

Resposta indisponível: HTTP `503`.

```json
{
  "status": "error",
  "database": "disconnected",
  "timestamp": "2026-10-19T18:00:00.000Z"
}
```

As respostas de readiness não expõem mensagens de erro, endereço do banco nem detalhes internos.
