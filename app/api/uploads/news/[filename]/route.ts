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
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Загружаем файл только с VDS
    if (!isVDSStorageConfigured()) {
      console.error("[uploads/news] VDS storage is not configured");
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }

    try {
      const fileKey = `news/${filename}`;
      const fileBuffer = await getFileFromVDS(fileKey);

      // Return file with proper headers
      return new NextResponse(fileBuffer as any, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (vdsError) {
      console.error("[uploads/news] VDS error:", vdsError);
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("[uploads/news] Error serving file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

