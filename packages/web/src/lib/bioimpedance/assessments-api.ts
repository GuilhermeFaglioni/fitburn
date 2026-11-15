import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssessmentClient,
  AssessmentsList,
  BioimpedanceAssessment,
  CreateAssessmentRequest,
  UpdateAssessmentRequest,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

const JSON_HEADERS = { "Content-Type": "application/json" };
const BASE = "/api/bioimpedance/assessments";

export const assessmentKeys = {
  all: ["bioimpedance", "assessments"] as const,
  list: (range: AssessmentRange) => ["bioimpedance", "assessments", "list", range] as const,
  one: (id: string) => ["bioimpedance", "assessments", "one", id] as const,
  clients: ["bioimpedance", "assessments", "clients"] as const,
};

/** Período da lista de avaliações recentes (D-042: só clientes com consentimento vigente aparecem). */
export type AssessmentRange = "30d" | "year" | "all";

function rangeStart(range: AssessmentRange): string | undefined {
  const now = new Date();
  if (range === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  return undefined;
}

export async function listAssessments(range: AssessmentRange): Promise<AssessmentsList> {
  const params = new URLSearchParams({ limit: "100" });
  const from = rangeStart(range);
  if (from) params.set("from", from);
  const response = await authFetch(`${BASE}?${params.toString()}`);
  return (await parseOrThrow(response)) as AssessmentsList;
}

export async function listAssessmentClients(): Promise<AssessmentClient[]> {
  const response = await authFetch(`${BASE}/clients`);
  return (await parseOrThrow(response)) as AssessmentClient[];
}

export async function getAssessment(id: string): Promise<BioimpedanceAssessment> {
  const response = await authFetch(`${BASE}/${encodeURIComponent(id)}`);
  return (await parseOrThrow(response)) as BioimpedanceAssessment;
}

export async function createAssessment(input: CreateAssessmentRequest): Promise<BioimpedanceAssessment> {
  const response = await authFetch(BASE, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return (await parseOrThrow(response)) as BioimpedanceAssessment;
}

export async function updateAssessment(
  id: string,
  input: UpdateAssessmentRequest,
): Promise<BioimpedanceAssessment> {
  const response = await authFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return (await parseOrThrow(response)) as BioimpedanceAssessment;
}

export async function deleteAssessment(id: string): Promise<void> {
  const response = await authFetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseOrThrow(response);
}

export function useAssessments(range: AssessmentRange) {
  return useQuery({ queryKey: assessmentKeys.list(range), queryFn: () => listAssessments(range) });
}

export function useAssessmentClients() {
  return useQuery({ queryKey: assessmentKeys.clients, queryFn: listAssessmentClients });
}

export function useAssessment(id: string | undefined) {
  return useQuery({
    queryKey: assessmentKeys.one(id ?? ""),
    queryFn: () => getAssessment(id as string),
    enabled: id !== undefined,
  });
}

function useInvalidateAssessments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: assessmentKeys.all });
}

export function useCreateAssessment() {
  const invalidate = useInvalidateAssessments();
  return useMutation({ mutationFn: createAssessment, onSuccess: invalidate });
}

export function useUpdateAssessment() {
  const invalidate = useInvalidateAssessments();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssessmentRequest }) =>
      updateAssessment(id, input),
    onSuccess: invalidate,
  });
}

/** Avaliações do próprio cliente. Seguem visíveis e excluíveis depois de revogar a autorização (D-042). */
export const myAssessmentKeys = {
  list: ["bioimpedance", "assessments", "mine"] as const,
};

export async function listMyAssessments(): Promise<BioimpedanceAssessment[]> {
  const response = await authFetch(`${BASE}/mine`);
  return (await parseOrThrow(response)) as BioimpedanceAssessment[];
}

export async function deleteMyAssessment(id: string): Promise<void> {
  const response = await authFetch(`${BASE}/mine/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseOrThrow(response);
}

export function useMyAssessments() {
  return useQuery({ queryKey: myAssessmentKeys.list, queryFn: listMyAssessments });
}

export function useDeleteMyAssessment() {
  const invalidate = useInvalidateAssessments();
  return useMutation({ mutationFn: deleteMyAssessment, onSuccess: invalidate });
}

export function useDeleteAssessment() {
  const invalidate = useInvalidateAssessments();
  return useMutation({ mutationFn: deleteAssessment, onSuccess: invalidate });
}
