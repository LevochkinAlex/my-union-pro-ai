import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { initVDSStorageFromEnv, getFileFromVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".zip": "application/zip",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".rtf": "application/rtf",
};

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
    const contentType = MIME[ext] || "application/octet-stream";

    if (!isVDSStorageConfigured()) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }

    const fileKey = `meeting-attachments/${filename}`;
    const fileBuffer = await getFileFromVDS(fileKey);

    return new NextResponse(fileBuffer as Buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("[uploads/meeting-attachments] Error:", e);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
