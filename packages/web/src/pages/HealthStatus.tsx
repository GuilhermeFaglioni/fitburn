import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../lib/api-client";

export function HealthStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  if (isLoading) {
    return <p role="status">Verificando status da API…</p>;
  }

  if (isError || !data) {
    return <p role="alert">Não foi possível conectar à API.</p>;
  }

  return (
    <div>
      <p>Status da API: {data.status === "ok" ? "operacional" : "com problema"}</p>
      <p>Banco de dados: {data.database === "connected" ? "conectado" : "desconectado"}</p>
    </div>
  );
}
