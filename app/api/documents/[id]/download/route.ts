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
    const { searchParams } = new URL(request.url);
    const downloadSigned = searchParams.get("signed") === "true";

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

    // Определяем, какой файл скачивать: подписанный или обычный
    let filePathToDownload = downloadSigned && document.signedFilePath 
      ? document.signedFilePath 
      : document.filePath;

    let fileBuffer: Buffer | null = null;

    if (document.content && !downloadSigned) {
      // Документ хранится в базе данных как base64 (только для обычного файла)
      fileBuffer = Buffer.from(document.content, "base64");
      console.log("[documents/download] Загружен из базы данных (base64), размер:", fileBuffer.length);
    } else if (filePathToDownload) {
      // Документ хранится как файл на диске
      try {
        let absolutePath = resolveFilePath(filePathToDownload);
        console.log("[documents/download] Пытаемся прочитать файл:", absolutePath);
        console.log("[documents/download] Исходный путь из БД:", filePathToDownload);
        console.log("[documents/download] Скачиваем подписанный файл:", downloadSigned);
        
        // Проверяем существование файла
        try {
          await fs.access(absolutePath);
          console.log("[documents/download] Файл существует");
        } catch (accessError) {
          console.error("[documents/download] Файл не существует:", absolutePath);
          
          // Если запрашивается подписанный файл, но он не найден - возвращаем ошибку
          if (downloadSigned) {
            return NextResponse.json(
              { error: `Подписанный документ не найден. Пожалуйста, загрузите подписанный документ.` },
              { status: 404 }
            );
          }
          
          return NextResponse.json(
            { error: `Файл не найден: ${filePathToDownload}` },
            { status: 404 }
          );
        }
        
        // Читаем файл
        fileBuffer = await fs.readFile(absolutePath);
        console.log("[documents/download] Файл успешно прочитан, размер:", fileBuffer.length);
      } catch (error) {
        console.error("[documents/download] Ошибка при чтении файла:", error);
        console.error("[documents/download] Путь:", filePathToDownload);
        console.error("[documents/download] Абсолютный путь:", resolveFilePath(filePathToDownload));
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
    const fileNameToUse = downloadSigned && document.signedFilePath
      ? (filePathToDownload?.split("/").pop() || document.fileName || "document.pdf")
      : (document.fileName || "document.pdf");
    
    if (!contentType || contentType === "application/pdf") {
      // Если mimeType не указан или PDF, проверяем расширение файла
      const fileName = fileNameToUse || filePathToDownload || "";
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
      fileName: fileNameToUse,
      size: fileBuffer.length,
      signed: downloadSigned,
    });

    // Возвращаем файл
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileNameToUse)}"`,
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

