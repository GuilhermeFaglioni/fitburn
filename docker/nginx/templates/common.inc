# Ajustes de contexto http, comuns a todas as variantes.
server_tokens off;
# DNS interno do Docker (necessário para resolver "api" em tempo de requisição).
resolver 127.0.0.11 valid=10s ipv6=off;
