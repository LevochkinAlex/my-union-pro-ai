import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendUserNotification } from "@/lib/notifications";
import { getOrCreatePrivateChat, sendChatMessage } from "@/lib/chat-utils";
import { getPPOHead, isMemberOfOrganization } from "@/lib/ppo-head-utils";

/**
 * POST /api/ppo-head/members/[id]/reject
 * Отклонить заявку на вступление в профсоюз
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
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim() === "") {
      return NextResponse.json(
        { error: "Необходимо указать причину отклонения" },
        { status: 400 }
      );
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
        membershipStatus: "REJECTED",
      },
    });

    // Создаем или находим чат с членом профсоюза
    const chat = await getOrCreatePrivateChat(chairman.id, member.id);

    // Создаем сообщение с причиной отклонения
    const rejectionMessage = `Ваша заявка на вступление в профсоюз отклонена.\n\nПричина: ${reason.trim()}\n\nПожалуйста, исправьте указанные ошибки и подайте заявку повторно.`;
    
    await sendChatMessage(chat.id, chairman.id, rejectionMessage);

    // Отправляем уведомление
    await sendUserNotification({
      userId: member.id,
      type: "ticket_response",
      title: "Заявка отклонена",
      body: `Ваша заявка на вступление в профсоюз отклонена. Причина: ${reason}`,
      url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard/profile`,
    });

    return NextResponse.json({
      success: true,
      message: "Заявка отклонена",
      member: updatedMember,
    });
  } catch (error: any) {
    console.error("[ppo-head/members] POST reject error:", error);
    return NextResponse.json(
      {
        error: "Ошибка при отклонении заявки",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

