import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { getOrCreatePrivateChat } from "@/lib/chat-service";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { isMemberOfOrganization } from "@/lib/ppo-head-utils";
import { subscribeUserToOrganizationChannel } from "@/lib/channel-utils";

/**
 * POST /api/ppo-head/members/[id]/approve
 * Одобрить заявку на вступление в профсоюз
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const perm = await checkUserPermissions(session.user.id, "members_manage");
    if (!perm.hasAccess || !perm.organizationId) {
      return NextResponse.json(
        { error: "Нет прав на управление членами профсоюза" },
        { status: 403 }
      );
    }

    const orgName = await prisma.organization.findUnique({
      where: { id: perm.organizationId },
      select: { name: true },
    });

    const { id } = await params;

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
      // body may be empty — keep default (today)
    }

    // Находим члена профсоюза
    const member = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        organizationId: true,
        membershipStatus: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Член профсоюза не найден" },
        { status: 404 }
      );
    }

    // Проверяем, что член принадлежит той же организации
    if (!(await isMemberOfOrganization(member.id, perm.organizationId))) {
      return NextResponse.json(
        { error: "Член профсоюза не принадлежит вашей организации" },
        { status: 403 }
      );
    }

    const updatedMember = await prisma.user.update({
      where: { id },
      data: {
        membershipStatus: "APPROVED",
        unionMembershipStatus: "ACCEPTED",
        role: "MEMBER",
        membershipJoinedAt,
        membershipExcludedAt: null,
        membershipExclusionReason: null,
      },
    });

    const chat = await getOrCreatePrivateChat(session.user.id, member.id);

    if (member.organizationId) {
      await subscribeUserToOrganizationChannel(member.id, member.organizationId);
    }

    const congratulationMessage = `Поздравляем! Ваша заявка на вступление в профсоюз "${orgName?.name || "организацию"}" одобрена. Добро пожаловать в наш профсоюз!`;

    // Отправляем уведомление
    await sendUserNotification({
      userId: member.id,
      type: "documents_ready",
      title: "Заявка одобрена",
      body: congratulationMessage,
      url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard/profile`,
    });

    return NextResponse.json({
      success: true,
      message: "Заявка одобрена",
      member: updatedMember,
    });
  } catch (error: any) {
    console.error("[ppo-head/members] POST approve error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при одобрении заявки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

