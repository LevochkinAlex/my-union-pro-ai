import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";
import { getPPOHead } from "@/lib/ppo-head-utils";

/**
 * GET /api/ppo-head/documents
 * Получить список документов профкома для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    // Получаем документы профкома (AGENDA, PROTOCOL, RESOLUTION, PROTOCOL_EXTRACT)
    const documents = await prisma.document.findMany({
      where: {
        organizationId: chairman.organizationId,
        type: {
          in: [
            DocumentType.AGENDA,
            DocumentType.PROTOCOL,
            DocumentType.RESOLUTION,
            DocumentType.PROTOCOL_EXTRACT,
          ],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error("[ppo-head/documents] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении документов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

