import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireRpoScope, getRpoTemplateRoles, publishTemplateToOrganizations } from "@/lib/rpo-role-templates";
import { getChildOrganizationIds } from "@/lib/ppo-head-utils";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await requireRpoScope(session.user.id);
    if (!scope) {
      return NextResponse.json(
        { error: "Доступно только для руководителей РПО" },
        { status: 403 }
      );
    }

    const targetOrgIds = await getChildOrganizationIds(scope.organizationId);
    if (targetOrgIds.length === 0) {
      return NextResponse.json(
        { error: "Нет подчинённых организаций для публикации" },
        { status: 400 }
      );
    }

    const roles = await getRpoTemplateRoles(scope.organizationId);
    if (roles.length === 0) {
      return NextResponse.json(
        { error: "Нет шаблонов ролей для публикации" },
        { status: 400 }
      );
    }

    let publishedRoles = 0;
    for (const role of roles) {
      const result = await publishTemplateToOrganizations(role.id, targetOrgIds);
      if (!("error" in result)) {
        publishedRoles += 1;
      }
    }

    return NextResponse.json({
      success: true,
      publishedRoles,
      organizationsCount: targetOrgIds.length,
    });
  } catch (error) {
    console.error("[rpo/roles/publish-all] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при массовой публикации ролей" },
      { status: 500 }
    );
  }
}
