import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  requireRpoScope,
  publishTemplateToOrganizations,
} from "@/lib/rpo-role-templates";
import { getChildOrganizationIds } from "@/lib/ppo-head-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const body = await request.json().catch(() => ({}));
    let targetOrgIds: string[] = body.organizationIds;

    if (!targetOrgIds || targetOrgIds.length === 0) {
      targetOrgIds = await getChildOrganizationIds(scope.organizationId);
    }

    if (targetOrgIds.length === 0) {
      return NextResponse.json(
        { error: "Нет подчинённых организаций для публикации" },
        { status: 400 }
      );
    }

    const result = await publishTemplateToOrganizations(id, targetOrgIds);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      publishedCount: result.publishedCount,
      templateName: result.template.name,
    });
  } catch (error) {
    console.error("[rpo/roles/[id]/publish] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка при публикации роли" },
      { status: 500 }
    );
  }
}
