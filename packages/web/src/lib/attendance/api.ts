import { z } from "zod";
import {
  attendanceClassSchema,
  attendanceEntrySchema,
  attendanceRosterSchema,
  type AttendanceClass,
  type AttendanceEntry,
  type AttendanceMark,
  type AttendanceRoster,
} from "@fitburn/contracts";
import { authFetch } from "../auth/authFetch";
import { parseOrThrow } from "../auth/api";
import { downloadCsv } from "../exports/download-csv";

export async function listAttendanceClasses(from: string, to: string): Promise<AttendanceClass[]> {
  const params = new URLSearchParams({ from, to });
  const response = await authFetch(`/api/attendance/classes?${params.toString()}`);
  return z.array(attendanceClassSchema).parse(await parseOrThrow(response));
}

export async function getAttendanceRoster(occurrenceId: string): Promise<AttendanceRoster> {
  const response = await authFetch(`/api/attendance/classes/${occurrenceId}`);
  return attendanceRosterSchema.parse(await parseOrThrow(response));
}

export async function markAttendance(
  reservationId: string,
  status: AttendanceMark,
): Promise<AttendanceEntry> {
  const response = await authFetch(`/api/attendance/reservations/${reservationId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return attendanceEntrySchema.parse(await parseOrThrow(response));
}

/** Baixa o CSV de presenças agregadas por aula entre `from` e `to` (datas locais `YYYY-MM-DD`, inclusivas). */
export function exportAttendanceCsv(from: string, to: string): Promise<void> {
  return downloadCsv("/api/exports/attendance", { from, to }, `presencas_${from}_${to}.csv`);
}
