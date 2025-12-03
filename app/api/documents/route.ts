import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

// Константы для устава (системный документ, доступный всем)
const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
const CHARTER_TITLE = "Устав Профсоюза работников здравоохранения РФ";
const CHARTER_DESCRIPTION = "Устав Профсоюза работников здравоохранения РФ (принят на VII съезде, апрель 2021)";
const CHARTER_FILENAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем документы пользователя
    const documents = await prisma.document.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        description: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        filePath: true,
        signedFilePath: true,
        driveFileId: true,
        driveUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Проверяем, есть ли устав в документах пользователя
    const hasCharter = documents.some(
      (doc) =>
        doc.type === "OTHER" &&
        (doc.title?.toLowerCase().includes("устав") ||
          doc.description?.toLowerCase().includes("устав"))
    );

    // Если устава нет, добавляем его как виртуальный документ (доступен всем)
    // Документы из public/docs/union/ НЕ показываются пользователям - они только для ИИ базы знаний
    if (!hasCharter) {
      // Вычисляем размер файла устава, если он существует
      let charterFileSize: number | null = null;
      let charterFilePath: string | null = CHARTER_PATH;
      
      try {
        const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          charterFileSize = stats.size;
        } else {
          // Файл не найден - убираем filePath, чтобы кнопка скачивания не показывалась
          charterFilePath = null;
        }
      } catch (error) {
        console.warn("[documents] Не удалось получить размер файла устава:", error);
        charterFilePath = null;
      }

      // Добавляем устав в начало списка (виртуальный документ)
      const charterDocument = {
        id: "charter-system", // Специальный ID для системного документа
        type: "OTHER" as const,
        status: "GENERATED" as const,
        title: CHARTER_TITLE,
        description: CHARTER_DESCRIPTION,
        fileName: CHARTER_FILENAME,
        fileSize: charterFileSize,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filePath: charterFilePath, // null если файл не найден
        signedFilePath: null,
        driveFileId: null,
        driveUrl: null,
        createdAt: new Date("2021-04-01"), // Дата принятия устава
        updatedAt: new Date("2021-04-01"),
      };

      documents.unshift(charterDocument);
    }

    // Сортируем документы по приоритету:
    // 1. Заявления (MEMBERSHIP_APPLICATION, CONTRIBUTION_APPLICATION) - по дате (новые сверху)
    // 2. Обращения (APPEAL) - по дате
    // 3. Прочие документы (OTHER, системные) - по дате
    const sortedDocuments = documents.sort((a, b) => {
      // Определяем приоритет типа документа
      const getPriority = (type: string) => {
        switch (type) {
          case "MEMBERSHIP_APPLICATION":
            return 1;
          case "CONTRIBUTION_APPLICATION":
            return 2;
          case "APPEAL":
            return 3;
          case "OTHER":
            return 4;
          default:
            return 5;
        }
      };

      const priorityA = getPriority(a.type);
      const priorityB = getPriority(b.type);

      // Сначала сортируем по приоритету
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Если приоритет одинаковый, сортируем по дате (новые сверху)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ documents: sortedDocuments });
  } catch (error) {
    console.error("Ошибка получения документов:", error);
    return NextResponse.json(
      { error: "Ошибка при получении документов" },
      { status: 500 }
    );
  }
}

