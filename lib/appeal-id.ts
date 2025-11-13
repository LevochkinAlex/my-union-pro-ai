/**
 * Generate an 8-digit public ID for appeals
 * Format: 10000000-99999999 (8 digits)
 */
export function generateAppealPublicId(): string {
  const min = 10000000;
  const max = 99999999;
  const randomId = Math.floor(Math.random() * (max - min + 1)) + min;
  return randomId.toString();
}

/**
 * Format appeal ID for display
 * E.g., "12345678" -> "1234-5678"
 */
export function formatAppealId(id: string): string {
  if (id.length !== 8) return id;
  return `${id.slice(0, 4)}-${id.slice(4)}`;
}

/**
 * Unformat appeal ID
 * E.g., "1234-5678" -> "12345678"
 */
export function unformatAppealId(formatted: string): string {
  return formatted.replace('-', '');
}

