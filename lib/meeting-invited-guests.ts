/**
 * Список «Присутствовали приглашённые» в протоколе и выписке:
 * объединяет текст из поля заседания invitedGuests и внешних участников (участники с externalName).
 */

export type ParticipantWithExternal = {
  externalName: string | null;
  externalPosition: string | null;
};

export function formatExternalParticipantLine(p: ParticipantWithExternal): string | null {
  const name = p.externalName?.trim();
  if (!name) return null;
  const pos = p.externalPosition?.trim();
  return pos ? `${name} (${pos})` : name;
}

/** Уникальные строки: сначала из текста (через запятую/точку с запятой), затем внешние участники без дублей */
export function mergeInvitedGuestParts(
  storedText: string | null | undefined,
  participants: ParticipantWithExternal[]
): string[] {
  const storedParts = (storedText || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const externalParts = participants
    .map(formatExternalParticipantLine)
    .filter((x): x is string => x != null);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...storedParts, ...externalParts]) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}
