import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { getOrCreatePrivateChat, sendChatMessage } from "@/lib/chat-utils";
import { getPPOHead, isMemberOfOrganization } from "@/lib/ppo-head-utils";

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

    // Проверяем, что пользователь является Председателем
    const chairman = await getPPOHead(session.user.id);

    if (!chairman || !chairman.organization) {
      return NextResponse.json(
        { error: "Доступ запрещен или организация не назначена" },
        { status: 403 }
      );
    }

    const { id } = await params;

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
    if (!(await isMemberOfOrganization(member.id, chairman.organizationId))) {
      return NextResponse.json(
        { error: "Член профсоюза не принадлежит вашей организации" },
        { status: 403 }
      );
    }

    // Обновляем статус
    const updatedMember = await prisma.user.update({
      where: { id },
      data: {
        membershipStatus: "APPROVED",
        membershipJoinedAt: new Date(),
      },
    });

    // Создаем или находим чат с членом профсоюза
    const chat = await getOrCreatePrivateChat(chairman.id, member.id);

    // Создаем сообщение с поздравлением
    const congratulationMessage = `Поздравляем! Ваша заявка на вступление в профсоюз "${chairman.organization?.name || "организацию"}" одобрена. Добро пожаловать в наш профсоюз!`;
    
    await sendChatMessage(chat.id, chairman.id, congratulationMessage);

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

