import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { initVDSStorageFromEnv, uploadFileToVDS, isVDSStorageConfigured } from "@/lib/vds-storage";

// Инициализируем VDS хранилище при загрузке модуля
if (typeof window === "undefined") {
  initVDSStorageFromEnv();
}

/**
 * POST /api/documents/upload-signed
 * Загрузка подписанного документа
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const documentId = formData.get("documentId") as string;

    if (!file || !documentId) {
      return NextResponse.json(
        { error: "Файл и ID документа обязательны" },
        { status: 400 }
      );
    }

    console.log("[upload-signed] Uploading:", {
      userId: session.user.id,
      documentId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    // Проверяем что документ принадлежит пользователю
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: session.user.id,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Документ не найден" },
        { status: 404 }
      );
    }

    // Валидация файла
    const maxSize = 50 * 1024 * 1024; // 50 МБ
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Файл слишком большой (максимум 50 МБ)" },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Недопустимый тип файла. Разрешены: PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    // Сохраняем файл
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const extension = path.extname(file.name);
    const timestamp = Date.now();
    const safeFileName = `signed_${documentId}_${timestamp}${extension}`;
    const fileKey = `signed/${safeFileName}`;
    
    let publicPath: string;
    
    // Всегда загружаем на VDS, если он настроен
    if (isVDSStorageConfigured()) {
      try {
        publicPath = await uploadFileToVDS(fileKey, buffer, file.type);
        console.log(`[upload-signed] File uploaded to VDS: ${publicPath}`);
      } catch (vdsError) {
        console.error("[upload-signed] VDS upload failed:", vdsError);
        throw new Error(`Не удалось загрузить файл на сервер: ${vdsError instanceof Error ? vdsError.message : String(vdsError)}`);
      }
    } else {
      throw new Error("VDS storage не настроен. Настройте переменные окружения VDS_STORAGE_HOST, VDS_STORAGE_PASSWORD или VDS_STORAGE_PRIVATE_KEY_PATH");
    }

    console.log("[upload-signed] File saved:", publicPath);

    // Обновляем документ в БД
    const updatedDoc = await prisma.document.update({
      where: { id: documentId },
      data: {
        signedFilePath: publicPath,
        status: "SIGNED",
        updatedAt: new Date(),
      },
    });

    console.log("[upload-signed] Document updated:", updatedDoc.id);

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      message: "Подписанный документ успешно загружен",
    });
  } catch (error) {
    console.error("[upload-signed] Error:", error);
    return NextResponse.json(
      {
        error: "Не удалось загрузить документ",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

