import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishTemplateToOrganizations, requireRpoScope } from "@/lib/rpo-role-templates";

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
      return NextResponse.json({ error: "Доступно только для РПО" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      organizationIds?: string[];
      includeTypes?: Array<"PRIMARY" | "LOCAL" | "REGIONAL">;
    };

    let targetOrganizationIds = Array.isArray(body.organizationIds)
      ? body.organizationIds.filter((orgId): orgId is string => typeof orgId === "string" && orgId.length > 0)
      : [];

    if (targetOrganizationIds.length === 0) {
      const includeTypes = Array.isArray(body.includeTypes) && body.includeTypes.length > 0
        ? body.includeTypes
        : ["PRIMARY"];

      const organizations = await prisma.organization.findMany({
        where: {
          id: { in: scope.organizationIds },
          type: { in: includeTypes as any },
        },
        select: { id: true },
      });
      targetOrganizationIds = organizations.map((org) => org.id);
    }

    targetOrganizationIds = targetOrganizationIds.filter((orgId) => scope.organizationIds.includes(orgId));

    if (targetOrganizationIds.length === 0) {
      return NextResponse.json(
        { error: "Нет организаций в scope для публикации шаблона" },
        { status: 400 }
      );
    }

    const publishResult = await publishTemplateToOrganizations(id, targetOrganizationIds);
    if ("error" in publishResult) {
      return NextResponse.json({ error: publishResult.error }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      templateId: publishResult.template.id,
      publishedCount: publishResult.publishedCount,
      organizationIds: targetOrganizationIds,
      roles: publishResult.roles,
    });
  } catch (error: any) {
    console.error("[org-head/roles/[id]/publish] POST error:", error);
    return NextResponse.json(
      { error: "Ошибка публикации шаблона роли", details: error?.message },
      { status: 500 }
    );
  }
}

