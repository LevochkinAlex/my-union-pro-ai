import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * GET /api/news/image?path=/uploads/news/filename.jpg
 * Обслуживает изображения новостей из файловой системы
 * Поддерживает как старые пути, так и новые форматы имен файлов
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const imagePath = searchParams.get("path");

    if (!imagePath) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    // Безопасность: проверяем, что путь начинается с /uploads/news/
    if (!imagePath.startsWith("/uploads/news/")) {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }

    // Извлекаем имя файла из пути
    const fileName = path.basename(imagePath);
    
    // Пробуем найти файл в разных форматах
    // В базе данных путь может быть: /uploads/news/1764317982219-nbglpfi5mxo.jpg
    // В файловой системе файл может быть: news-1764317982219-nbglpfi5mxo.jpg
    const possiblePaths = [
      // Точный путь из базы данных
      path.join(process.cwd(), "public", imagePath),
      // Если имя файла не начинается с "news-", пробуем добавить префикс
      !fileName.startsWith("news-") 
        ? path.join(process.cwd(), "public", "uploads", "news", `news-${fileName}`)
        : path.join(process.cwd(), "public", "uploads", "news", fileName),
      // Просто имя файла (на случай если путь уже правильный)
      path.join(process.cwd(), "public", "uploads", "news", fileName),
    ];

    let fileBuffer: Buffer | null = null;
    let mimeType = "image/jpeg";

    for (const filePath of possiblePaths) {
      try {
        await fs.access(filePath);
        fileBuffer = await fs.readFile(filePath);
        
        // Определяем MIME тип по расширению
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".png") mimeType = "image/png";
        else if (ext === ".webp") mimeType = "image/webp";
        else if (ext === ".gif") mimeType = "image/gif";
        
        break;
      } catch (error) {
        // Файл не найден, пробуем следующий путь
        continue;
      }
    }

    if (!fileBuffer) {
      // Файл не найден - это нормальное поведение, не логируем как ошибку
      // Возвращаем 204 No Content вместо 404, чтобы браузер не показывал это как ошибку
      return new NextResponse(null, { status: 204 });
    }

    return new NextResponse(fileBuffer as any, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[news/image] Error:", error);
    return NextResponse.json(
      { error: "Failed to serve image" },
      { status: 500 }
    );
  }
}

