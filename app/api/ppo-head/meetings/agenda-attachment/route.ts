/**
 * POST /api/ppo-head/meetings/agenda-attachment
 * Загрузка файла к пункту повестки (материалы). Файл сохраняется в хранилище,
 * в документ повестки не попадает — доступен председателю и участникам.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";
import path from "path";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "txt", "md", "csv",
  "ppt", "pptx", "odt", "ods", "odp", "rtf", "jpg", "jpeg", "png", "zip",
];
const MAX_SIZE_MB = 20;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_create");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещён или организация не назначена" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Размер файла не должен превышать ${MAX_SIZE_MB} МБ` },
        { status: 400 }
      );
    }

    const ext = path.extname(file.name).slice(1).toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Недопустимый формат. Разрешены: ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, "_");
    const fileName = `${Date.now()}_${safeName}`;
    const fileKey = `meeting-attachments/${fileName}`;

    if (!isVDSStorageConfigured()) {
      return NextResponse.json(
        { error: "Хранилище файлов не настроено. Обратитесь к администратору." },
        { status: 503 }
      );
    }

    const vdsPath = await uploadFileToVDS(fileKey, buffer, file.type || "application/octet-stream");
    const apiUrl = vdsPath.replace(/^\/uploads\//, "/api/uploads/");

    return NextResponse.json({
      url: apiUrl,
      name: file.name,
      size: file.size,
    });
  } catch (error: unknown) {
    console.error("[ppo-head/meetings/agenda-attachment] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при загрузке файла",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
