/**
 * Извлекает одноразовый токен входа из deep link, HTTPS-ссылки бота или сырой строки.
 */
export function extractMobileLoginToken(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  const fromLoginToken = s.match(/(?:[?&#])loginToken=([^&\s#]+)/i);
  if (fromLoginToken) {
    try {
      return decodeURIComponent(fromLoginToken[1]);
    } catch {
      return fromLoginToken[1];
    }
  }

  const fromT = s.match(/(?:[?&#])t=([^&\s#]+)/i);
  if (fromT) {
    try {
      return decodeURIComponent(fromT[1]);
    } catch {
      return fromT[1];
    }
  }

  const hexOnly = s.match(/\b([a-f0-9]{64})\b/i);
  if (hexOnly) return hexOnly[1];

  if (/^[a-f0-9]{64}$/i.test(s)) return s;

  return null;
}
