import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function resolveFilePath(filePath: string) {
  const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return path.join(process.cwd(), "public", normalized);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await Promise.resolve(context.params);

    // Получаем документ
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    }

    // Проверяем права доступа (пользователь может скачать только свои документы)
    if (document.userId !== session.user.id && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Доступ запрещен" }, { status: 403 });
    }

    let fileBuffer: Buffer | null = null;

    if (document.content) {
      // Документ хранится в базе данных как base64
      fileBuffer = Buffer.from(document.content, "base64");
      console.log("[documents/download] Загружен из базы данных (base64), размер:", fileBuffer.length);
    } else if (document.filePath) {
      // Документ хранится как файл на диске
      try {
        const absolutePath = resolveFilePath(document.filePath);
        console.log("[documents/download] Пытаемся прочитать файл:", absolutePath);
        console.log("[documents/download] Исходный путь из БД:", document.filePath);
        
        // Проверяем существование файла
        try {
          await fs.access(absolutePath);
          console.log("[documents/download] Файл существует");
        } catch (accessError) {
          console.error("[documents/download] Файл не существует:", absolutePath);
          return NextResponse.json(
            { error: `Файл не найден: ${document.filePath}` },
            { status: 404 }
          );
        }
        
        fileBuffer = await fs.readFile(absolutePath);
        console.log("[documents/download] Файл успешно прочитан, размер:", fileBuffer.length);
      } catch (error) {
        console.error("[documents/download] Ошибка при чтении файла:", error);
        console.error("[documents/download] Путь:", document.filePath);
        console.error("[documents/download] Абсолютный путь:", resolveFilePath(document.filePath));
        return NextResponse.json(
          { error: `Не удалось прочитать файл: ${error instanceof Error ? error.message : String(error)}` },
          { status: 500 }
        );
      }
    }

    if (!fileBuffer) {
      console.error("[documents/download] Содержимое документа не найдено. filePath:", document.filePath, "content:", document.content ? "есть" : "нет");
      return NextResponse.json(
        { error: "Содержимое документа не найдено" },
        { status: 404 }
      );
    }

    const fileBytes = new Uint8Array(fileBuffer.length);
    fileBytes.set(fileBuffer);
    const arrayBuffer = fileBytes.buffer;

    // Определяем Content-Type на основе mimeType документа или расширения файла
    let contentType = document.mimeType || "application/pdf";
    if (!contentType || contentType === "application/pdf") {
      // Если mimeType не указан или PDF, проверяем расширение файла
      const fileName = document.fileName || document.filePath || "";
      if (fileName.endsWith(".docx")) {
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileName.endsWith(".doc")) {
        contentType = "application/msword";
      } else if (fileName.endsWith(".pdf")) {
        contentType = "application/pdf";
      }
    }

    console.log("[documents/download] Возвращаем файл:", {
      contentType,
      fileName: document.fileName,
      size: fileBuffer.length,
    });

    // Возвращаем файл
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.fileName || "document.pdf")}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Ошибка скачивания документа:", error);
    return NextResponse.json(
      { error: "Ошибка при скачивании документа" },
      { status: 500 }
    );
  }
}

