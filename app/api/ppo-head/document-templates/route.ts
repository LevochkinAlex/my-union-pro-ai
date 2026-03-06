import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";
import { checkUserPermissions } from "@/lib/staff-permissions";

/**
 * GET /api/ppo-head/document-templates
 * Получить список шаблонов документов профкома для Председателя
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "documents_view");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as DocumentType | null;

    const where: any = {
      type: {
        in: [
          DocumentType.AGENDA,
          DocumentType.PROTOCOL,
          DocumentType.RESOLUTION,
          DocumentType.PROTOCOL_EXTRACT,
        ],
      },
      isActive: true,
    };

    if (type) {
      where.type = type;
    }

    const templates = await prisma.documentTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isDefault: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error("[ppo-head/document-templates] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при получении шаблонов",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

