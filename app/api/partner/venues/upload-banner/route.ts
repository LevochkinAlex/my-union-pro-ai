import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { ensurePartner } from "@/lib/partner-auth";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";
import { optimizePartnerVenueBannerToWebp, getMimeType } from "@/lib/image-optimizer";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

/** POST /api/partner/venues/upload-banner — баннер площадки 16:9 (после обрезки на клиенте) */
export async function POST(request: NextRequest) {
  try {
    const { error } = await ensurePartner();
    if (error) return error;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "Размер файла не должен превышать 10MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(bytes) as Buffer;
    let originalName = file.name || "banner.jpg";
    // Blob из canvas иногда приходит без type
    let mimeType = file.type || "image/jpeg";

    if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
      try {
        const converted = await convertHeicToJpegServer(buffer, originalName, mimeType);
        buffer = converted.buffer as Buffer;
        originalName = converted.fileName;
        mimeType = converted.mimeType;
      } catch (e) {
        console.error("[partner/venues/upload-banner] HEIC convert:", e);
      }
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Разрешены только изображения (JPEG, PNG, WebP, HEIC/HEIF)" },
        { status: 400 }
      );
    }

    const optimized = await optimizePartnerVenueBannerToWebp(buffer);
    const optimizedBuffer = optimized.buffer;
    const optimizedMime = getMimeType("webp");
    const fileExtension = "webp";

    if (!isVDSStorageConfigured()) {
      const base64 = optimizedBuffer.toString("base64");
      const dataUrl = `data:${optimizedMime};base64,${base64}`;
      return NextResponse.json({
        success: true,
        url: dataUrl,
        fileName: originalName,
      });
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const fileKey = `partner-venues/${fileName}`;

    try {
      const vdsPath = await uploadFileToVDS(fileKey, optimizedBuffer, optimizedMime);
      const apiUrl = vdsPath.replace(/^\/uploads\//, "/api/uploads/");
      return NextResponse.json({
        success: true,
        url: apiUrl,
        fileName: originalName,
      });
    } catch (vdsError) {
      console.error("[partner/venues/upload-banner] VDS upload failed, saving locally:", vdsError);
      try {
        const localDir = path.join(process.cwd(), "public", "uploads", "partner-venues");
        await mkdir(localDir, { recursive: true });
        const localPath = path.join(localDir, fileName);
        await writeFile(localPath, optimizedBuffer);
        const apiUrl = `/api/uploads/partner-venues/${fileName}`;
        return NextResponse.json({
          success: true,
          url: apiUrl,
          fileName: originalName,
        });
      } catch (localErr) {
        console.error("[partner/venues/upload-banner] Local fallback failed:", localErr);
        const base64 = optimizedBuffer.toString("base64");
        const dataUrl = `data:${optimizedMime};base64,${base64}`;
        return NextResponse.json({
          success: true,
          url: dataUrl,
          fileName: originalName,
        });
      }
    }
  } catch (e) {
    console.error("[partner/venues/upload-banner]", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
