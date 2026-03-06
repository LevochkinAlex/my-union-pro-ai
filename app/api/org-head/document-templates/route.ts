/**
 * GET /api/org-head/document-templates
 * Список шаблонов документов для руководителя РПО (только просмотр).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope || scope.level !== "RPO") {
      return NextResponse.json(
        { error: "Доступно только для руководителей РПО" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as DocumentType | null;

    const allowedTypes: DocumentType[] = [
      DocumentType.AGENDA,
      DocumentType.PROTOCOL,
      DocumentType.RESOLUTION,
      DocumentType.PROTOCOL_EXTRACT,
    ];
    const where: { type: DocumentType | { in: DocumentType[] }; isActive: boolean } = {
      type: type && allowedTypes.includes(type) ? type : { in: allowedTypes },
      isActive: true,
    };

    const templates = await prisma.documentTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[org-head/document-templates] GET error:", error);
    return NextResponse.json(
      { error: "Ошибка при получении шаблонов" },
      { status: 500 }
    );
  }
}
