import { legalDocumentResponseSchema, type LegalDocumentResponse } from "@fitburn/contracts";
import { trackedFetch } from "../connectivity/connectivity-store";
import { parseOrThrow } from "../auth/api";

export type LegalDocumentKey = "privacy-policy" | "terms-of-use";

export async function getLegalDocument(key: LegalDocumentKey): Promise<LegalDocumentResponse> {
  const response = await trackedFetch(`/api/legal-documents/${key}`);
  return legalDocumentResponseSchema.parse(await parseOrThrow(response));
}
