# Proxy reverso para a API (incluído dentro de "location /api/").
# A API resolve pelo DNS interno do Docker a cada requisição (variável em vez de
# "upstream"): o nginx sobe mesmo com a API fora e acompanha o novo IP quando o
# contêiner é recriado num deploy. Sem URI no proxy_pass, o caminho /api/... é
# repassado intacto.
set $fitburn_api http://api:3333;
proxy_pass $fitburn_api;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_connect_timeout 5s;
proxy_read_timeout 60s;
proxy_send_timeout 60s;
