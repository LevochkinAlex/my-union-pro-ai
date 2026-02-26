import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgHeadScope } from "@/lib/org-head-permissions";
import { subscribeUserToOrganizationChannel } from "@/lib/channel-utils";

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

    const { id } = await context.params;
    let membershipJoinedAt: Date = new Date();

    try {
      const body = await request.json().catch(() => ({}));
      if (body.membershipJoinedAt) {
        const parsed = new Date(body.membershipJoinedAt);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          membershipJoinedAt = parsed;
        }
      }
    } catch {
      // noop
    }

    const member = await prisma.user.findUnique({
      where: { id },
      select: { id: true, organizationId: true, membershipStatus: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }

    const updatedMember = await prisma.user.update({
      where: { id },
      data: {
        membershipStatus: "APPROVED",
        unionMembershipStatus: "ACCEPTED",
        membershipJoinedAt,
      },
      select: {
        id: true,
        membershipStatus: true,
        membershipJoinedAt: true,
      },
    });

    await subscribeUserToOrganizationChannel(member.id, member.organizationId);

    return NextResponse.json({
      success: true,
      message: "Пользователь одобрен",
      member: updatedMember,
    });
  } catch (error: any) {
    console.error("[org-head/members/[id]/approve] POST error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при одобрении",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
