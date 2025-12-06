import { NextRequest, NextResponse } from "next/server";
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

    // Загружаем файл только с VDS
    let fileBuffer: Buffer | null = null;
    
    if (isVDSStorageConfigured()) {
      try {
        const fileKey = `avatars/${filename}`;
        fileBuffer = await getFileFromVDS(fileKey);
      } catch (vdsError) {
        console.error("[uploads/avatars] VDS error:", vdsError);
      }
    } else {
      console.error("[uploads/avatars] VDS storage is not configured");
    }
    
    if (!fileBuffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
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

