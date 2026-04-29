/**
 * Origin главного сайта для metadataBase и canonical URL.
 * Не использует CDN-субдомены: иначе Next.js собирает /icon.png → https://cdn.../icon.png (ERR_SSL).
 */
export function getSafeSiteOrigin(): URL {
  const prod = new URL("https://myunion.pro");
  const devDefault = new URL("http://localhost:3000");
  try {
    const raw =
      process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXTAUTH_URL?.trim();
    if (!raw) {
      return process.env.NODE_ENV === "development" ? devDefault : prod;
    }
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (
      u.hostname === "cdn.myunion.pro" ||
      /^cdn\./i.test(u.hostname) ||
      /\.cdn\.myunion\.pro$/i.test(u.hostname)
    ) {
      return prod;
    }
    return new URL(`${u.origin}`);
  } catch {
    return process.env.NODE_ENV === "development" ? devDefault : prod;
  }
}
