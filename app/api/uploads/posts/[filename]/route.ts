import { NextRequest, NextResponse } from "next/server";
import path from "path";
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

    // Загружаем файл только с VDS
    if (!isVDSStorageConfigured()) {
      console.error("[uploads/posts] VDS storage is not configured");
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }

    try {
      const fileKey = `posts/${filename}`;
      const fileBuffer = await getFileFromVDS(fileKey);
      
      if (fileBuffer && fileBuffer.length > 0) {
        return new NextResponse(fileBuffer as any, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": `inline; filename="${filename}"`,
          },
        });
      }
    } catch (vdsError) {
      console.error("[uploads/posts] VDS error:", vdsError);
    }

    // Файл не найден на VDS
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  } catch (error: any) {
    console.error("[uploads/posts] Error serving file:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

