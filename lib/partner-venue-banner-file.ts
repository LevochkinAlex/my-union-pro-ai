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
 * Из URL баннера площадки (как в БД) получает ключ `partner-venues/<filename>`.
 * Внешние и data: URL не обрабатываются.
 */
export function extractPartnerVenueBannerFileKey(
  bannerUrl: string | null | undefined
): string | null {
  if (!bannerUrl || typeof bannerUrl !== "string") return null;
  const t = bannerUrl.trim();
  if (!t || t.startsWith("data:")) return null;

  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      const pathname = u.pathname;
      const m = pathname.match(/\/(?:api\/)?uploads\/partner-venues\/([^/]+)$/);
      if (m?.[1]) return `partner-venues/${m[1]}`;
      return null;
    }
  } catch {
    /* относительный путь ниже */
  }

  const m2 = t.match(/^(?:\/api)?\/uploads\/partner-venues\/([^/?#]+)/);
  if (m2?.[1]) return `partner-venues/${m2[1]}`;
  return null;
}

/**
 * Удаляет файл баннера из public/uploads и с VDS (если настроено).
 */
export async function deletePartnerVenueBannerStoredFile(
  bannerUrl: string | null | undefined
): Promise<void> {
  const key = extractPartnerVenueBannerFileKey(bannerUrl);
  if (!key) return;

  const localFullPath = path.join(process.cwd(), "public", "uploads", key);
  try {
    await unlink(localFullPath);
  } catch {
    /* файла нет локально */
  }

  if (isVDSStorageConfigured()) {
    try {
      await deleteFileFromVDS(key);
    } catch (e) {
      console.warn("[partner-venue-banner-file] VDS delete failed:", key, e);
    }
  }
}
