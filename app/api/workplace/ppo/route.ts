import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findPPOsByWorkplace } from "@/lib/workplace-ppo-mapping";

/**
 * GET /api/workplace/ppo?workplaceName=...&workplaceInn=...
 * Найти все ППО, привязанные к месту работы (по справочнику).
 * Справочник заполняется в админке: Организации → редактирование ППО/региональной/местной → блок
 * «Привязанные места работы (юр. лица)». Анкета и профиль по ИНН и названию места работы
 * вызывают этот API и получают список ППО для выбора (или автоподстановку при одном результате).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workplaceName = searchParams.get("workplaceName")?.trim() ?? "";
    const workplaceInn = searchParams.get("workplaceInn")?.trim() ?? "";

    if (!workplaceName || !workplaceInn) {
      return NextResponse.json(
        { error: "Необходимо указать название и ИНН места работы" },
        { status: 400 }
      );
    }

    const ppoOptions = await findPPOsByWorkplace(workplaceName, workplaceInn);

    return NextResponse.json({
      success: true,
      found: ppoOptions.length > 0,
      ppoOrganizations: ppoOptions,
      // Один результат — для обратной совместиости
      ppoOrganization: ppoOptions[0] ?? null,
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
