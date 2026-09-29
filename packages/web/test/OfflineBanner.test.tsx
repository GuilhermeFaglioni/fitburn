import { act, render, screen } from "@testing-library/react";
import { OfflineBanner } from "../src/components/OfflineBanner";
import { setBrowserOnline } from "./connectivity-helpers";

describe("OfflineBanner", () => {
  it("não aparece enquanto o navegador está online", () => {
    render(<OfflineBanner />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aparece quando o navegador fica offline e some quando a conexão volta", () => {
    render(<OfflineBanner />);

    act(() => setBrowserOnline(false));
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");

    act(() => setBrowserOnline(true));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("já aparece se a página abre com o navegador offline", () => {
    setBrowserOnline(false);

    render(<OfflineBanner />);

    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
  });
});
