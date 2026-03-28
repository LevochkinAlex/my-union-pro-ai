/** Декодирует payload JWT (без проверки подписи) — только для отображения после OAuth redirect. */
export function decodeMobileJwtPayload(token: string): {
  sub?: string;
  email?: string;
  role?: string;
} | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
    if (typeof atob === "undefined") return null;
    const json = atob(pad);
    return JSON.parse(json) as { sub?: string; email?: string; role?: string };
  } catch {
    return null;
  }
}
