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

    // Получаем документы пользователя (исходящие - созданные пользователем)
    const outgoingDocuments = await prisma.document.findMany({
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
        verificationStatus: true,
        verificationMessage: true,
        verifiedAt: true,
      },
    });

    // Получаем документы, назначенные пользователю для ознакомления (входящие)
    const incomingDocuments = await prisma.document.findMany({
      where: { assignedToId: session.user.id },
      orderBy: { assignedAt: "desc" },
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
        verificationStatus: true,
        verificationMessage: true,
        verifiedAt: true,
        assignedAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
          },
        },
      },
    });

    // Добавляем устав во входящие документы (если его еще нет)
    const hasCharterInIncoming = incomingDocuments.some(
      (doc: any) =>
        doc.id === "charter-system" ||
        (doc.type === "OTHER" &&
          (doc.title?.toLowerCase().includes("устав") ||
            doc.description?.toLowerCase().includes("устав")))
    );

    if (!hasCharterInIncoming) {
      // Вычисляем размер файла устава, если он существует
      let charterFileSize: number | null = null;
      let charterFilePath: string | null = CHARTER_PATH;
      
      try {
        const fullPath = path.join(process.cwd(), "public", CHARTER_PATH);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          charterFileSize = stats.size;
        } else {
          charterFilePath = null;
        }
      } catch (error) {
        console.warn("[documents] Не удалось получить размер файла устава:", error);
        charterFilePath = null;
      }

      // Добавляем устав в начало списка входящих документов
      const charterDocument = {
        id: "charter-system",
        type: "OTHER" as const,
        status: "GENERATED" as const,
        title: CHARTER_TITLE,
        description: CHARTER_DESCRIPTION,
        fileName: CHARTER_FILENAME,
        fileSize: charterFileSize,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filePath: charterFilePath,
        signedFilePath: null,
        driveFileId: null,
        driveUrl: null,
        verificationStatus: null,
        verificationMessage: null,
        verifiedAt: null,
        createdAt: new Date("2021-04-01"),
        updatedAt: new Date("2021-04-01"),
        assignedAt: null,
        user: null,
      };

      incomingDocuments.unshift(charterDocument);
    }

    // Сортируем исходящие документы по приоритету
    const sortedOutgoingDocuments = outgoingDocuments.sort((a, b) => {
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

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ 
      incomingDocuments: incomingDocuments,
      outgoingDocuments: sortedOutgoingDocuments,
    });
  } catch (error) {
    console.error("Ошибка получения документов:", error);
    return NextResponse.json(
      { error: "Ошибка при получении документов" },
      { status: 500 }
    );
  }
}

