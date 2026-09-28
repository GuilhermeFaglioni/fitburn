import { z } from "zod";
import {
  classTemplateDetailSchema,
  instructorSummarySchema,
  modalityDetailSchema,
  type ClassTemplateDetail,
  type CreateClassTemplateRequest,
  type CreateModalityRequest,
  type InstructorSummary,
  type ModalityDetail,
  type UpdateClassTemplateRequest,
  type UpdateModalityRequest,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export async function listModalities(): Promise<ModalityDetail[]> {
  const response = await authFetch("/api/modalities");
  return z.array(modalityDetailSchema).parse(await parseOrThrow(response));
}

export async function createModality(input: CreateModalityRequest): Promise<ModalityDetail> {
  const response = await authFetch("/api/modalities", jsonRequest("POST", input));
  return modalityDetailSchema.parse(await parseOrThrow(response));
}

export async function updateModality(
  id: string,
  input: UpdateModalityRequest,
): Promise<ModalityDetail> {
  const response = await authFetch(`/api/modalities/${id}`, jsonRequest("PATCH", input));
  return modalityDetailSchema.parse(await parseOrThrow(response));
}

export async function activateModality(id: string): Promise<ModalityDetail> {
  const response = await authFetch(`/api/modalities/${id}/activate`, { method: "POST" });
  return modalityDetailSchema.parse(await parseOrThrow(response));
}

export async function deactivateModality(id: string): Promise<ModalityDetail> {
  const response = await authFetch(`/api/modalities/${id}/deactivate`, { method: "POST" });
  return modalityDetailSchema.parse(await parseOrThrow(response));
}

export async function deleteModality(id: string): Promise<void> {
  const response = await authFetch(`/api/modalities/${id}`, { method: "DELETE" });
  await parseOrThrow(response);
}

export async function listClassTemplates(): Promise<ClassTemplateDetail[]> {
  const response = await authFetch("/api/class-templates");
  return z.array(classTemplateDetailSchema).parse(await parseOrThrow(response));
}

export async function listInstructors(): Promise<InstructorSummary[]> {
  const response = await authFetch("/api/class-templates/instructors");
  return z.array(instructorSummarySchema).parse(await parseOrThrow(response));
}

export async function createClassTemplate(
  input: CreateClassTemplateRequest,
): Promise<ClassTemplateDetail> {
  const response = await authFetch("/api/class-templates", jsonRequest("POST", input));
  return classTemplateDetailSchema.parse(await parseOrThrow(response));
}

export async function updateClassTemplate(
  id: string,
  input: UpdateClassTemplateRequest,
): Promise<ClassTemplateDetail> {
  const response = await authFetch(`/api/class-templates/${id}`, jsonRequest("PATCH", input));
  return classTemplateDetailSchema.parse(await parseOrThrow(response));
}

export async function activateClassTemplate(id: string): Promise<ClassTemplateDetail> {
  const response = await authFetch(`/api/class-templates/${id}/activate`, { method: "POST" });
  return classTemplateDetailSchema.parse(await parseOrThrow(response));
}

export async function deactivateClassTemplate(id: string): Promise<ClassTemplateDetail> {
  const response = await authFetch(`/api/class-templates/${id}/deactivate`, { method: "POST" });
  return classTemplateDetailSchema.parse(await parseOrThrow(response));
}

export async function deleteClassTemplate(id: string): Promise<void> {
  const response = await authFetch(`/api/class-templates/${id}`, { method: "DELETE" });
  await parseOrThrow(response);
}
