# Antes de publicar a landing no domínio da Fitburn

Lista para o dono do produto, fora do escopo da #179. A landing está pronta como proposta comercial em `site.fitburn.faglionidev.com`, com `noindex`.

1. Fotos reais do estúdio e da equipe, com autorização de uso de imagem de quem aparece. Substituem todas as fotos de banco (hoje há placeholders; ver `packages/landing/CREDITS.md`).
2. Logo em vetor oficial.
3. Confirmar o limite de 400 alunos e o tempo de casa (CNPJ aberto em 2019; o site diz "mais de 10 anos").
4. Confirmar os horários: segunda abre 05:30 ou 06:00? Sábado? Domingo?
5. Nomes e registros profissionais da equipe de saúde (CRN, CREFITO, CRM). Só então nomes e descrições mais detalhadas entram na seção "Equipe de saúde".
6. Depoimentos com autorização por escrito, e o link e a nota do Google Meu Negócio, se houver. Reabre a seção de prova social.
7. E-mail de contato, se houver, e prazo de resposta do WhatsApp.
8. Meta numérica de conversão.
9. Trocar `PUBLIC_SITE_URL` e `PUBLIC_INDEXABLE=true` (variáveis de build da landing) e remover o `X-Robots-Tag: noindex` do nginx, enviar o sitemap no Search Console e alinhar o nome, o endereço e o telefone no Instagram, Facebook e Google Meu Negócio.
10. Plano para o blog atual: redirecionamentos 301, para não perder o tráfego orgânico.
