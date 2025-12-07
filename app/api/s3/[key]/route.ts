/**
 * API endpoint для получения файлов из S3 хранилища
 * Использует signed URLs для безопасного доступа
 */

import { NextRequest, NextResponse } from "next/server";
import { getFileFromS3, getSignedUrlForFile, isS3StorageConfigured } from "@/lib/s3-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } | Promise<{ key: string }> }
) {
  try {
    if (!isS3StorageConfigured()) {
      return NextResponse.json(
        { error: "S3 storage is not configured" },
        { status: 503 }
      );
    }

    const resolvedParams = await Promise.resolve(params);
    const key = decodeURIComponent(resolvedParams.key);

    // Генерируем временный signed URL для доступа к файлу
    // URL действителен 1 час
    const signedUrl = await getSignedUrlForFile(key, 3600);

    // Редиректим на signed URL
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("[s3] Error getting file:", error);
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 }
    );
  }
}

