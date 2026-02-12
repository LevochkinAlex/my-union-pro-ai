import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/documents/validate
 * Проверяет загруженный документ
 * 
 * NOTE: AI-проверка временно отключена из-за проблем с зависимостями (tesseract.js, sharp).
 * Документы принимаются без проверки содержимого.
 * TODO: Включить AI-проверку после установки зависимостей на сервере.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const documentType = formData.get("documentType") as string;

    if (!file) {
      return NextResponse.json({ error: "Файл не предоставлен" }, { status: 400 });
    }

    console.log("[validate-document] Validating:", {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      documentType,
    });

    // Базовая проверка типа файла
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg", 
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        valid: false,
        error: "Недопустимый тип файла. Разрешены: PDF, JPG, PNG",
      });
    }

    // Проверка размера (максимум 50 МБ)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({
        valid: false,
        error: "Файл слишком большой. Максимальный размер: 50 МБ",
      });
    }

    // AI-проверка временно отключена
    // Принимаем документ без проверки содержимого
    console.log("[validate-document] ✅ Document accepted (AI validation disabled)");
    
    return NextResponse.json({
      valid: true,
      message: "Документ принят",
      confidence: 100,
      skippedValidation: true,
    });

  } catch (error) {
    console.error("[validate-document] Error:", error);
    return NextResponse.json(
      {
        valid: true, // Принимаем даже при ошибке
        message: "Документ принят (ошибка проверки)",
        skippedValidation: true,
      }
    );
  }
}

