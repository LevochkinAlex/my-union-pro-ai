import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const scope = await getOrgHeadScope(session.user.id);
    if (!scope) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const { id: memberId } = await context.params;
    let reason = "";
    try {
      const body = await request.json();
      reason = (body.reason || "").trim();
    } catch {
      // empty body is acceptable
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: { id: true, organizationId: true, membershipStatus: true, unionMembershipStatus: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }
    if (member.membershipStatus !== "APPROVED" && member.unionMembershipStatus !== "ACCEPTED") {
      return NextResponse.json(
        { error: "Можно исключить только активных членов профсоюза" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: memberId },
      data: {
        membershipStatus: "EXCLUDED",
        unionMembershipStatus: "REMOVED",
        role: "PENDING_MEMBER",
        isPPOHead: false,
        ppoHeadOrganizationId: null,
        viewMode: "MEMBER",
        membershipExcludedAt: new Date(),
        membershipExclusionReason: reason || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Пользователь исключён",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[org-head/members/exclude]", msg);
    return NextResponse.json({ error: "Ошибка при исключении" }, { status: 500 });
  }
}
