import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { initVDSStorageFromEnv, getFileFromVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const MIME_TYPES: { [key: string]: string } = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".svg": "image/svg+xml",
};

async function tryLocalFile(filename: string): Promise<Buffer | null> {
  const dir = path.join(process.cwd(), "public", "uploads", "news");
  const candidates = [
    path.join(dir, filename),
    ...(filename.startsWith("news-") ? [] : [path.join(dir, `news-${filename}`)]),
  ];
  for (const filePath of candidates) {
    try {
      await fs.access(filePath);
      return await fs.readFile(filePath);
    } catch {
      continue;
    }
  }
  return null;
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

    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    let fileBuffer: Buffer | null = null;

    if (isVDSStorageConfigured()) {
      try {
        const fileKey = `news/${filename}`;
        fileBuffer = await getFileFromVDS(fileKey);
      } catch (vdsError) {
        // Fallback: локальная папка public/uploads/news (dev или миграция)
        fileBuffer = await tryLocalFile(filename);
      }
    } else {
      fileBuffer = await tryLocalFile(filename);
    }

    if (!fileBuffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(fileBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[uploads/news] Error serving file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

