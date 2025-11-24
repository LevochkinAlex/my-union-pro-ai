import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

