import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { initVDSStorageFromEnv, getFileFromVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } | Promise<{ filename: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const filename = resolvedParams.filename;

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    // Защита от path traversal атак
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    let fileBuffer: Buffer | null = null;

    // 1) Пробуем VDS, если настроен
    if (isVDSStorageConfigured()) {
      try {
        const fileKey = `chat/${filename}`;
        fileBuffer = await getFileFromVDS(fileKey);
        if (fileBuffer?.length) {
          console.log(`[uploads/chat] Served from VDS: ${fileKey}`);
        }
      } catch (vdsError) {
        console.warn("[uploads/chat] VDS error, trying local:", vdsError);
      }
    }

    // 2) Fallback: локальная папка public/uploads/chat (вложения из обращений и т.д.)
    if (!fileBuffer || fileBuffer.length === 0) {
      const localPath = path.join(process.cwd(), "public", "uploads", "chat", filename);
      try {
        fileBuffer = await fs.readFile(localPath);
        if (fileBuffer?.length) {
          console.log(`[uploads/chat] Served from local: ${filename}`);
        }
      } catch (localError) {
        // файл не найден локально — оставляем fileBuffer пустым
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Определяем MIME тип по расширению
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".heic": "image/heic",
      ".heif": "image/heif",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Возвращаем файл с правильными заголовками
    return new NextResponse(fileBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("[uploads/chat] Error serving file:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

