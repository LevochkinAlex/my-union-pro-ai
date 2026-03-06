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
      // use default date
    }

    const member = await prisma.user.findUnique({
      where: { id },
      select: { id: true, organizationId: true, membershipStatus: true, unionMembershipStatus: true },
    });

    if (!member) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }
    if (!member.organizationId || !scope.organizationIds.includes(member.organizationId)) {
      return NextResponse.json({ error: "Нет доступа к пользователю" }, { status: 403 });
    }

    if (member.membershipStatus === "APPROVED" && member.unionMembershipStatus === "ACCEPTED") {
      return NextResponse.json(
        { error: "Пользователь уже одобрен" },
        { status: 400 }
      );
    }
    if (member.membershipStatus === "EXCLUDED") {
      return NextResponse.json(
        { error: "Нельзя одобрить исключённого пользователя. Сначала измените статус." },
        { status: 400 }
      );
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

    try {
      await subscribeUserToOrganizationChannel(member.id, member.organizationId);
    } catch {
      // non-critical
    }

    return NextResponse.json({
      success: true,
      message: "Пользователь одобрен",
      member: updatedMember,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[org-head/members/approve]", msg);
    return NextResponse.json({ error: "Ошибка при одобрении" }, { status: 500 });
  }
}
