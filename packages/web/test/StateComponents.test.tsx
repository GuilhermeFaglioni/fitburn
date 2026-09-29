import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../src/components/states";

describe("componentes compartilhados de estado", () => {
  it("LoadingState anuncia o carregamento como status para leitores de tela", () => {
    render(<LoadingState />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando…");
  });

  it("LoadingState aceita um rótulo específico da tela", () => {
    render(<LoadingState label="Carregando a agenda…" />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando a agenda…");
  });

  it("ErrorState mostra a mensagem como alerta e oferece tentar de novo", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Não foi possível carregar os clientes." onRetry={onRetry} />);
    const user = userEvent.setup();

    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os clientes.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ErrorState sem onRetry não mostra o botão", () => {
    render(<ErrorState message="Algo deu errado." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("EmptyState mostra a mensagem e uma ação opcional", () => {
    render(
      <EmptyState message="Nenhum cliente encontrado." action={<button>Novo cliente</button>} />,
    );

    expect(screen.getByText("Nenhum cliente encontrado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo cliente" })).toBeInTheDocument();
  });

  it("Feedback de sucesso é um status e o de erro é um alerta", () => {
    render(
      <>
        <Feedback tone="success">Salvo com sucesso.</Feedback>
        <Feedback tone="error">Não foi possível salvar.</Feedback>
      </>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Salvo com sucesso.");
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar.");
  });
});
