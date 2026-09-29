import { act, render, screen } from "@testing-library/react";
import { RequiresNetwork } from "../src/components/RequiresNetwork";
import { useNetworkRequired } from "../src/lib/connectivity/useNetworkRequired";
import { setBrowserOnline } from "./connectivity-helpers";

describe("RequiresNetwork", () => {
  it("deixa a ação intacta quando há conexão", () => {
    render(
      <RequiresNetwork>
        <button>Reservar</button>
      </RequiresNetwork>,
    );

    const button = screen.getByRole("button", { name: "Reservar" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("title");
  });

  it("desabilita a ação e explica o motivo enquanto não há conexão, e reabilita quando volta", () => {
    render(
      <RequiresNetwork>
        <button>Reservar</button>
      </RequiresNetwork>,
    );

    act(() => setBrowserOnline(false));
    const button = screen.getByRole("button", { name: "Reservar" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", expect.stringContaining("sem conexão"));

    act(() => setBrowserOnline(true));
    expect(screen.getByRole("button", { name: "Reservar" })).toBeEnabled();
  });

  it("não reabilita uma ação que a tela já mantinha desabilitada", () => {
    render(
      <RequiresNetwork>
        <button disabled title="Turma lotada">
          Reservar
        </button>
      </RequiresNetwork>,
    );

    expect(screen.getByRole("button", { name: "Reservar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reservar" })).toHaveAttribute("title", "Turma lotada");
  });

  it("mantém o título original quando há conexão", () => {
    render(
      <RequiresNetwork>
        <button title="Reservar vaga">Reservar</button>
      </RequiresNetwork>,
    );

    expect(screen.getByRole("button", { name: "Reservar" })).toHaveAttribute("title", "Reservar vaga");
  });
});

describe("useNetworkRequired", () => {
  function Probe() {
    const { offline, reason } = useNetworkRequired();
    return <p>{offline ? reason : "conectado"}</p>;
  }

  it("expõe se há falta de conexão e o motivo, para ações que não são um botão simples", () => {
    render(<Probe />);
    expect(screen.getByText("conectado")).toBeInTheDocument();

    act(() => setBrowserOnline(false));

    expect(screen.getByText(/sem conexão/i)).toBeInTheDocument();
  });
});
