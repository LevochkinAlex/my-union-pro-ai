import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

/**
 * DELETE /api/admin/workplace-ppo-mapping/[id]
 * Удалить связь место работы → ППО (SUPER_ADMIN, PPO_HEAD или org-head в рамках scope)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    const isSuperAdmin = user?.role === "SUPER_ADMIN";
    const isPpoHead = user?.role === "PPO_HEAD";
    const orgHeadScope = !isSuperAdmin && !isPpoHead ? await getOrgHeadScope(session.user.id) : null;
    if (!isSuperAdmin && !isPpoHead && !orgHeadScope) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID не указан" }, { status: 400 });
    }

    const mapping = await prisma.workplacePPOMapping.findUnique({
      where: { id },
      select: { ppoOrganizationId: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "Связь не найдена" }, { status: 404 });
    }
    if (orgHeadScope && !orgHeadScope.organizationIds.includes(mapping.ppoOrganizationId)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    await prisma.workplacePPOMapping.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[admin/workplace-ppo-mapping] DELETE error:", error);
    return NextResponse.json(
      { error: error?.message || "Ошибка удаления" },
      { status: 500 }
    );
  }
}
