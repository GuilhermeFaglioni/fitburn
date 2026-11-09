// Aplica o tema salvo antes do primeiro desenho, para a página não piscar no tema errado (D-038).
// Tem de ser um arquivo, não inline: a CSP do nginx usa script-src 'self'. Mantém a chave e as cores de
// src/lib/theme/theme.ts. Sem escolha salva (ou com localStorage indisponível), não faz nada: vale o sistema.
/* global window, document */
(function () {
  try {
    var theme = window.localStorage.getItem("fb-theme");
    if (theme !== "light" && theme !== "dark") return;
    document.documentElement.setAttribute("data-theme", theme);
    var color = theme === "dark" ? "#0A0A0A" : "#FFFFFF";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", color);
  } catch {
    // localStorage bloqueado: segue o sistema.
  }
})();
