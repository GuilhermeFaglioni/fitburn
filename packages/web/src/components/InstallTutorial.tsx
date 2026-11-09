import { useState } from "react";
import { detectInstallPlatform, type InstallPlatform } from "../lib/pwa/install-tutorial";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Segmented, type SegmentedOption } from "./ui/Segmented";

const PLATFORMS: readonly SegmentedOption<InstallPlatform>[] = [
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
];

const GUIDES: Record<InstallPlatform, { browser: string; steps: readonly string[] }> = {
  ios: {
    browser: "No Safari do iPhone ou iPad",
    steps: [
      "Toque em Compartilhar, o ícone de quadrado com uma seta para cima.",
      "Escolha “Adicionar à Tela de Início”.",
      "Toque em “Adicionar”.",
    ],
  },
  android: {
    browser: "No Chrome do Android",
    steps: [
      "Abra o menu (⋮), no canto superior do Chrome.",
      "Escolha “Instalar app” ou “Adicionar à tela inicial”.",
      "Confirme a instalação.",
    ],
  },
};

/**
 * Tutorial de instalação do PWA (#177): diálogo com o switch iOS | Android (a escolha inicial segue o aparelho) e três
 * passos por plataforma. Conteúdo estático, funciona sem rede. Monte-o só enquanto estiver aberto; quem o abre decide
 * o que fazer ao fechar (a Home marca como visto, o Perfil não mexe em nada).
 */
export function InstallTutorial({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<InstallPlatform>(detectInstallPlatform);
  const guide = GUIDES[platform];

  return (
    <Dialog
      title="Instale o Fitburn no seu celular"
      description="Deixe o Fitburn na tela inicial e abra como um app, com acesso rápido."
      onClose={onClose}
      className="fb-ui-install"
      actions={
        <Button variant="primary" onClick={onClose}>
          Entendi
        </Button>
      }
    >
      <Segmented label="Sistema do aparelho" options={PLATFORMS} value={platform} onChange={setPlatform} />
      <div className="fb-ui-install__guide">
        <p className="fb-ui-install__browser">{guide.browser}</p>
        <ol className="fb-ui-install__steps">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
