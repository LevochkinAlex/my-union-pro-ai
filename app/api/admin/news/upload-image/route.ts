import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserRole } from "@prisma/client";

// POST /api/admin/news/upload-image - загрузка изображения для новости
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (session?.user?.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    // Проверяем тип файла
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Разрешены только изображения (JPEG, PNG, WebP)" },
        { status: 400 }
      );
    }

    // Проверяем размер (максимум 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Размер файла не должен превышать 10MB" },
        { status: 400 }
      );
    }

    // Конвертируем в base64 для сохранения в БД
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    
    // Определяем MIME type
    const mimeType = file.type;
    
    // Создаем data URL для прямого использования в src
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({
      success: true,
      url: dataUrl,
      fileName: file.name,
    });
  } catch (error) {
    console.error("[upload-image] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

