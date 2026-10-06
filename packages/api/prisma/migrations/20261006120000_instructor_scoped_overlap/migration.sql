-- O espaço deixa de ser exclusivo: aulas simultâneas são permitidas desde que
-- de professores diferentes (ex.: várias Personal Class no mesmo horário).
-- A exclusion constraint passa a valer por professor. Aulas sem professor
-- continuam se excluindo entre si (COALESCE agrupa os NULL num mesmo "professor").
-- Mantém o nome da constraint: o serviço reconhece a violação por ele.
-- btree_gist permite combinar a igualdade de texto (=) com a sobreposição (&&) no GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "class_occurrences" DROP CONSTRAINT "class_occurrences_no_overlap";

ALTER TABLE "class_occurrences"
  ADD CONSTRAINT "class_occurrences_no_overlap"
  EXCLUDE USING gist (
    (COALESCE("instructorId", '')) WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" = 'SCHEDULED');
