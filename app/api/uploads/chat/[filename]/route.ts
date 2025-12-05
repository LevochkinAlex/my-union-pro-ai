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

    // Сначала пробуем локальный файл
    const localFilePath = path.join(process.cwd(), "public", "uploads", "chat", filename);
    
    let fileBuffer: Buffer | null = null;
    
    // Проверяем, запущены ли мы на самом VDS сервере
    const isRunningOnVDS = isVDSStorageConfigured() && 
      process.env.VDS_STORAGE_HOST === process.env.HOSTNAME || 
      process.env.VDS_STORAGE_HOST === 'localhost' ||
      process.env.VDS_STORAGE_HOST === '127.0.0.1';
    
    if (existsSync(localFilePath)) {
      fileBuffer = await readFile(localFilePath);
      console.log(`[uploads/chat] File found locally: ${localFilePath}`);
    } else if (isVDSStorageConfigured() && !isRunningOnVDS) {
      // Если локального файла нет и мы не на VDS, пробуем VDS через SSH
      try {
        const fileKey = `chat/${filename}`;
        console.log(`[uploads/chat] Trying to get file from VDS: ${fileKey}`);
        fileBuffer = await getFileFromVDS(fileKey);
        console.log(`[uploads/chat] File retrieved from VDS: ${fileKey}, size: ${fileBuffer?.length || 0} bytes`);
      } catch (vdsError) {
        console.error("[uploads/chat] VDS error:", vdsError);
        // Если VDS недоступен, пробуем еще раз локально (на случай если файл был загружен после проверки)
        if (existsSync(localFilePath)) {
          fileBuffer = await readFile(localFilePath);
          console.log(`[uploads/chat] File found locally after VDS error: ${localFilePath}`);
        }
      }
    } else if (isRunningOnVDS) {
      // Если мы на VDS, пробуем прямой путь
      const vdsFilePath = path.join(process.env.VDS_STORAGE_REMOTE_PATH || "/root/my-union-pro-ai/public/uploads", "chat", filename);
      if (existsSync(vdsFilePath)) {
        fileBuffer = await readFile(vdsFilePath);
        console.log(`[uploads/chat] File found on VDS directly: ${vdsFilePath}`);
      }
    }
    
    if (!fileBuffer) {
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

