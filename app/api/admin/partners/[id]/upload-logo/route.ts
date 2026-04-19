import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { prisma, withPrismaRetry } from "@/lib/prisma";
import { convertHeicToJpegServer } from "@/lib/heic-convert-server";
import { optimizePartnerLogoToWebp, getMimeType } from "@/lib/image-optimizer";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import { deletePartnerLogoStoredFile } from "@/lib/partner-logo-file";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

/** POST /api/admin/partners/[id]/upload-logo — логотип партнёра 1:1 (после обрезки на клиенте) */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const superResult = await ensureSuperAdmin();
    if (superResult.error) return superResult.error;

    const { id: partnerId } = await context.params;
    if (!partnerId) {
      return NextResponse.json({ error: "Не указан id партнёра" }, { status: 400 });
    }

    const existingPartner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, logoUrl: true },
    });
    if (!existingPartner) {
      return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
    }
    const previousLogoUrl = existingPartner.logoUrl;

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
    let originalName = file.name || "logo.jpg";
    let mimeType = file.type || "image/jpeg";

    if (mimeType.startsWith("image/") && mimeType !== "image/gif") {
      try {
        const converted = await convertHeicToJpegServer(buffer, originalName, mimeType);
        buffer = converted.buffer as Buffer;
        originalName = converted.fileName;
        mimeType = converted.mimeType;
      } catch (e) {
        console.error("[admin/partners/upload-logo] HEIC convert:", e);
      }
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: "Разрешены только изображения (JPEG, PNG, WebP, HEIC/HEIF)" },
        { status: 400 }
      );
    }

    const optimized = await optimizePartnerLogoToWebp(buffer);
    const optimizedBuffer = optimized.buffer;
    const optimizedMime = getMimeType("webp");
    const fileExtension = "webp";

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const fileKey = `partner-logos/${fileName}`;

    let publicUrl: string;

    if (!isVDSStorageConfigured()) {
      const localDir = path.join(process.cwd(), "public", "uploads", "partner-logos");
      await mkdir(localDir, { recursive: true });
      const localPath = path.join(localDir, fileName);
      await writeFile(localPath, optimizedBuffer);
      publicUrl = `/api/uploads/partner-logos/${fileName}`;
    } else {
      try {
        const vdsPath = await uploadFileToVDS(fileKey, optimizedBuffer, optimizedMime);
        publicUrl = vdsPath.replace(/^\/uploads\//, "/api/uploads/");
      } catch (vdsError) {
        console.error("[admin/partners/upload-logo] VDS upload failed, saving locally:", vdsError);
        try {
          const localDir = path.join(process.cwd(), "public", "uploads", "partner-logos");
          await mkdir(localDir, { recursive: true });
          const localPath = path.join(localDir, fileName);
          await writeFile(localPath, optimizedBuffer);
          publicUrl = `/api/uploads/partner-logos/${fileName}`;
        } catch (localErr) {
          console.error("[admin/partners/upload-logo] Local fallback failed:", localErr);
          return NextResponse.json({ error: "Не удалось сохранить файл" }, { status: 500 });
        }
      }
    }

    const partner = await withPrismaRetry(() =>
      prisma.partner.update({
        where: { id: partnerId },
        data: { logoUrl: publicUrl },
        include: {
          linkedUser: { select: { id: true, email: true } },
          cabinetUser: { select: { id: true, email: true } },
        },
      })
    );

    await deletePartnerLogoStoredFile(previousLogoUrl);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: originalName,
      partner,
    });
  } catch (e) {
    console.error("[admin/partners/upload-logo]", e);
    const isDev = process.env.NODE_ENV === "development";
    let message = "Ошибка загрузки";
    if (e instanceof Error && e.message) {
      message = isDev ? e.message : message;
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
