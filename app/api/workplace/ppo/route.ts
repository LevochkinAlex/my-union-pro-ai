import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findPPOByWorkplace } from "@/lib/workplace-ppo-mapping";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/workplace/ppo?workplaceName=...&workplaceInn=...
 * Найти ППО по месту работы
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workplaceName = searchParams.get("workplaceName");
    const workplaceInn = searchParams.get("workplaceInn");

    if (!workplaceName || !workplaceInn) {
      return NextResponse.json(
        { error: "Необходимо указать название и ИНН места работы" },
        { status: 400 }
      );
    }

    // Ищем ППО по месту работы
    const ppoMapping = await findPPOByWorkplace(workplaceName, workplaceInn);

    if (!ppoMapping) {
      return NextResponse.json({
        success: true,
        found: false,
        message: "ППО для данного места работы не найдено в справочнике",
      });
    }

    // Проверяем, что найденная организация действительно является ППО
    if (ppoMapping.ppoOrganization.type !== "PRIMARY") {
      return NextResponse.json({
        success: true,
        found: false,
        message: "Найденная организация не является ППО",
      });
    }

    return NextResponse.json({
      success: true,
      found: true,
      ppoOrganization: {
        id: ppoMapping.ppoOrganization.id,
        name: ppoMapping.ppoOrganization.name,
        chairmanName: ppoMapping.ppoOrganization.chairmanName,
        chairmanJobTitle: ppoMapping.ppoOrganization.chairmanJobTitle,
      },
    });
  } catch (error: any) {
    console.error("[workplace/ppo] GET error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при поиске ППО",
        message: error.message,
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
