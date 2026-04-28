import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { initVDSStorageFromEnv, getFileFromVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function tryLocalFile(filename: string): Promise<Buffer | null> {
  const dir = path.join(process.cwd(), "public", "uploads", "partner-venues");
  const filePath = path.join(dir, filename);
  try {
    await fs.access(filePath);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
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

    const fileKey = `partner-venues/${filename}`;

    /** Сначала локальный public/ — тот же путь, что при fallback после upload; избегает лишних SSH/HTTP к VDS */
    let fileBuffer: Buffer | null = await tryLocalFile(filename);

    if (!fileBuffer && isVDSStorageConfigured()) {
      try {
        fileBuffer = await getFileFromVDS(fileKey);
      } catch (e) {
        console.warn("[uploads/partner-venues] VDS read failed, file:", filename, e);
      }
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
    console.error("[uploads/partner-venues] Error serving file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
