import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sessionId = formData.get("sessionId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "Файл не предоставлен" },
        { status: 400 }
      );
    }

    // Ограничиваем размер файла до 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимальный размер: 10MB" },
        { status: 400 }
      );
    }

    // Определяем тип документа на основе имени файла и типа сессии
    let documentType: "MEMBERSHIP_APPLICATION" | "CONTRIBUTION_APPLICATION" | "OTHER" = "OTHER";
    const fileName = file.name.toLowerCase();
    
    if (sessionId) {
      const chatSession = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId: session.user.id,
        },
      });

      if (chatSession?.type === "STATEMENT") {
        // В чате заявления - скорее всего это подписанное заявление
        if (fileName.includes("вступлени") || fileName.includes("membership")) {
          documentType = "MEMBERSHIP_APPLICATION";
        } else if (fileName.includes("взнос") || fileName.includes("contributions")) {
          documentType = "CONTRIBUTION_APPLICATION";
        }
      }
    }

    // Создаем директорию для загрузок если её нет
    const uploadDir = path.join(process.cwd(), "public", "uploads", "documents");
    await mkdir(uploadDir, { recursive: true });

    // Генерируем уникальное имя файла
    const timestamp = Date.now();
    const fileExtension = path.extname(file.name);
    const baseName = path.basename(file.name, fileExtension);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, "_");
    const uniqueFileName = `${sanitizedBaseName}_${session.user.id}_${timestamp}${fileExtension}`;
    const filePath = path.join(uploadDir, uniqueFileName);

    // Сохраняем файл
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Сохраняем информацию о документе в базе данных
    const relativePath = `/uploads/documents/${uniqueFileName}`;
    
    const document = await prisma.document.create({
      data: {
        userId: session.user.id,
        type: documentType,
        status: documentType === "OTHER" ? "GENERATED" : "SIGNED", // Если это заявление - считаем подписанным
        title: file.name,
        fileName: file.name,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        ...(documentType !== "OTHER" && {
          signedFilePath: relativePath, // Для заявлений это подписанный файл
        }),
      },
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      fileName: file.name,
      filePath: relativePath,
      message: "Файл успешно загружен",
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Ошибка при загрузке файла" },
      { status: 500 }
    );
  }
}

