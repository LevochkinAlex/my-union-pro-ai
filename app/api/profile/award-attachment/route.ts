import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || "";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "awards");
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_DOC_TYPES = ["application/pdf"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * POST /api/profile/award-attachment
 * Загрузка файла/картинки к награде (изображения или PDF).
 * Возвращает { url, fileName, mimeType } для сохранения в award.attachments.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Разрешены только изображения (JPG, PNG, GIF, WebP) и PDF" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Размер файла не должен превышать 10 МБ" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg");
    const safeName = file.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, "_");
    const uniqueName = `${session.user.id}_${Date.now()}_${safeName}`.slice(0, 120) + ext;

    let url: string;
    const mimeType = file.type;
    const fileName = file.name;

    if (isVDSStorageConfigured()) {
      const fileKey = `awards/${uniqueName}`;
      const uploadedPath = await uploadFileToVDS(fileKey, buffer, mimeType);
      url = uploadedPath.startsWith("http")
        ? uploadedPath
        : `${CDN_URL || ""}${uploadedPath.startsWith("/") ? "" : "/"}${uploadedPath}`;
    } else {
      await ensureUploadDir();
      const localPath = path.join(UPLOAD_DIR, uniqueName);
      await writeFile(localPath, buffer);
      url = `/uploads/awards/${uniqueName}`;
    }

    return NextResponse.json({
      success: true,
      attachment: { url, fileName, mimeType },
    });
  } catch (error) {
    console.error("[award-attachment] Error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить файл" },
      { status: 500 }
    );
  }
}
