import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { initVDSStorageFromEnv, getFileFromVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Security: prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Сначала пробуем локальный файл
    const localFilePath = path.join(process.cwd(), "public", "uploads", "avatars", filename);
    
    let fileBuffer: Buffer | null = null;
    
    if (existsSync(localFilePath)) {
      fileBuffer = await readFile(localFilePath);
    } else if (isVDSStorageConfigured()) {
      // Если локального файла нет, пробуем VDS
      try {
        const fileKey = `avatars/${filename}`;
        fileBuffer = await getFileFromVDS(fileKey);
      } catch (vdsError) {
        console.error("[uploads/avatars] VDS error:", vdsError);
      }
    }
    
    if (!fileBuffer) {
      // Возвращаем 204 No Content вместо 404, чтобы браузер не показывал это как ошибку
      // Это нормальное поведение - файл может не существовать
      return new NextResponse(null, { status: 204 });
    }

    // Determine content type based on extension
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const contentType = contentTypes[ext || ""] || "application/octet-stream";

    // Return file with proper headers
    return new NextResponse(fileBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[uploads/avatars] Error serving file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

