import type { WorkoutSheet } from "@fitburn/contracts";
import { draftFromSheet, isDraftDirty, type SheetDraft } from "../src/pages/workout-sheets/draft";

function sheet(overrides: Partial<WorkoutSheet> = {}): WorkoutSheet {
  return {
    id: "s-1",
    clientId: "c-1",
    title: "Fase 2",
    notes: "Aquecer antes.",
    status: "ACTIVE",
    authorName: "Rafael",
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    exercises: [
      {
        id: "e-1",
        name: "Agachamento",
        sets: "4",
        reps: "10",
        load: null,
        duration: null,
        distance: null,
        notes: null,
      },
      {
        id: "e-2",
        name: "Prancha",
        sets: null,
        reps: null,
        load: null,
        duration: "45s",
        distance: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

function copy(draft: SheetDraft): SheetDraft {
  return { ...draft, rows: draft.rows.map((row) => ({ ...row })) };
}

describe("isDraftDirty", () => {
  describe("ficha nova", () => {
    const initial = draftFromSheet(null);

    it("o rascunho inicial é em branco, com status ativo, e não está sujo", () => {
      expect(initial).toEqual({ title: "", notes: "", status: "ACTIVE", rows: [] });
      expect(isDraftDirty(initial, copy(initial))).toBe(false);
    });

    it("título, observações, status ou exercício adicionado deixam sujo", () => {
      expect(isDraftDirty(initial, { ...initial, title: "Fase 1" })).toBe(true);
      expect(isDraftDirty(initial, { ...initial, notes: "Obs." })).toBe(true);
      expect(isDraftDirty(initial, { ...initial, status: "ARCHIVED" })).toBe(true);
      const blank = { key: 1, name: "", sets: "", reps: "", load: "", duration: "", distance: "", notes: "" };
      expect(isDraftDirty(initial, { ...initial, rows: [blank] })).toBe(true);
    });

    it("um espaço digitado conta: na dúvida, pergunta antes de descartar", () => {
      expect(isDraftDirty(initial, { ...initial, title: " " })).toBe(true);
    });

    it("voltar ao valor inicial deixa limpo de novo", () => {
      const edited = { ...initial, title: "a" };
      expect(isDraftDirty(initial, edited)).toBe(true);
      expect(isDraftDirty(initial, { ...edited, title: "" })).toBe(false);
    });
  });

  describe("ficha existente", () => {
    const initial = draftFromSheet(sheet());

    it("carrega os dados da ficha, com campos ausentes como texto vazio", () => {
      expect(initial.title).toBe("Fase 2");
      expect(initial.notes).toBe("Aquecer antes.");
      expect(initial.rows.map((row) => row.name)).toEqual(["Agachamento", "Prancha"]);
      expect(initial.rows[1]).toMatchObject({ sets: "", duration: "45s" });
      expect(draftFromSheet(sheet({ notes: null })).notes).toBe("");
    });

    it("igual ao carregado não está sujo (a chave da linha não conta)", () => {
      const same = copy(initial);
      same.rows[0]!.key = 99;
      expect(isDraftDirty(initial, same)).toBe(false);
    });

    it("qualquer campo da ficha ou de um exercício diferente deixa sujo", () => {
      expect(isDraftDirty(initial, { ...initial, title: "Fase 3" })).toBe(true);
      expect(isDraftDirty(initial, { ...initial, notes: "" })).toBe(true);
      expect(isDraftDirty(initial, { ...initial, status: "COMPLETED" })).toBe(true);
      for (const field of ["name", "sets", "reps", "load", "duration", "distance", "notes"] as const) {
        const edited = copy(initial);
        edited.rows[1]![field] = `${edited.rows[1]![field]}x`;
        expect(isDraftDirty(initial, edited), field).toBe(true);
      }
    });

    it("remover, adicionar ou reordenar exercícios deixa sujo", () => {
      const removed = copy(initial);
      removed.rows.pop();
      expect(isDraftDirty(initial, removed)).toBe(true);

      const added = copy(initial);
      added.rows.push({ ...added.rows[0]!, key: 3 });
      expect(isDraftDirty(initial, added)).toBe(true);

      const swapped = copy(initial);
      swapped.rows.reverse();
      expect(isDraftDirty(initial, swapped)).toBe(true);
    });
  });
});
