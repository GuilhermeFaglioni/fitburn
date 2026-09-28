import { z } from "zod";
import { clientAgendaItemSchema, type ClientAgendaItem } from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

export async function listClientAgenda(from: string, to: string): Promise<ClientAgendaItem[]> {
  const params = new URLSearchParams({ from, to });
  const response = await authFetch(`/api/agenda?${params.toString()}`);
  return z.array(clientAgendaItemSchema).parse(await parseOrThrow(response));
}

export async function getClientAgendaItem(id: string): Promise<ClientAgendaItem> {
  const response = await authFetch(`/api/agenda/${id}`);
  return clientAgendaItemSchema.parse(await parseOrThrow(response));
}
