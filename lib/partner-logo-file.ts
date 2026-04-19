import path from "path";
import { unlink } from "fs/promises";
import {
  initVDSStorageFromEnv,
  deleteFileFromVDS,
  isVDSStorageConfigured,
} from "@/lib/vds-storage";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

/**
 * Из URL логотипа партнёра (как в БД) получает ключ файла `partner-logos/<filename>`.
 * Внешние и data: URL не обрабатываются.
 */
export function extractPartnerLogoFileKey(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || typeof logoUrl !== "string") return null;
  const t = logoUrl.trim();
  if (!t || t.startsWith("data:")) return null;

  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      const pathname = u.pathname;
      const m = pathname.match(/\/(?:api\/)?uploads\/partner-logos\/([^/]+)$/);
      if (m?.[1]) return `partner-logos/${m[1]}`;
      return null;
    }
  } catch {
    /* относительный путь ниже */
  }

  const m2 = t.match(/^(?:\/api)?\/uploads\/partner-logos\/([^/?#]+)/);
  if (m2?.[1]) return `partner-logos/${m2[1]}`;
  return null;
}

/**
 * Удаляет файл логотипа из public/uploads и с VDS (если настроено). Ошибки VDS логируются, не пробрасываются.
 */
export async function deletePartnerLogoStoredFile(logoUrl: string | null | undefined): Promise<void> {
  const key = extractPartnerLogoFileKey(logoUrl);
  if (!key) return;

  const localFullPath = path.join(process.cwd(), "public", "uploads", key);
  try {
    await unlink(localFullPath);
  } catch {
    /* файла нет локально — нормально */
  }

  if (isVDSStorageConfigured()) {
    try {
      await deleteFileFromVDS(key);
    } catch (e) {
      console.warn("[partner-logo-file] VDS delete failed:", key, e);
    }
  }
}
