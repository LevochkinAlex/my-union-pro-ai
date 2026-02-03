/**
 * Групповой чат заседания: создание, участники (председатель — админ), системные сообщения о стадиях согласования.
 */

import { prisma } from "@/lib/prisma";
import { ChatType } from "@prisma/client";
import { assignAgendaToUserIds } from "@/lib/meeting-agenda-notify";

export interface MeetingGroupChatResult {
  chatId: string;
  created: boolean;
}

/**
 * Создаёт групповой чат заседания, если его ещё нет. Добавляет всех участников; председатель — админ.
 * Если чат уже есть — дополняет участников чата всеми участниками заседания с userId (зам., члены профкома и т.д.).
 */
export async function ensureMeetingGroupChat(meetingId: string): Promise<MeetingGroupChatResult | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: {
        where: { userId: { not: null } },
        include: {
          user: { select: { id: true } },
        },
      },
      groupChat: { select: { id: true } },
    },
  });

  if (!meeting) return null;

  const chairman = meeting.participants.find((p) => p.role === "CHAIRMAN");
  const chairmanUserId = chairman?.user?.id ?? meeting.createdById;
  const participantUserIds = meeting.participants
    .filter((p): p is typeof p & { user: { id: string } } => p.user != null)
    .map((p) => p.user.id);

  if (participantUserIds.length === 0) return null;

  // Чат уже есть — синхронизируем участников: добавляем тех, кого ещё нет в чате (зам., члены профкома и т.д.)
  if (meeting.groupChat) {
    const existing = await prisma.chatParticipant.findMany({
      where: { chatId: meeting.groupChat.id, leftAt: null },
      select: { userId: true },
    });
    const existingUserIds = new Set(existing.map((p) => p.userId));
    const toAdd = participantUserIds.filter((id) => !existingUserIds.has(id));
    if (toAdd.length > 0) {
      await prisma.chatParticipant.createMany({
        data: toAdd.map((userId) => ({
          chatId: meeting.groupChat!.id,
          userId,
          role: userId === chairmanUserId ? "admin" : "member",
          invitedById: chairmanUserId,
        })),
        skipDuplicates: true,
      });
      // Назначаем повестку новым участникам (копии во входящие + уведомления)
      await assignAgendaToUserIds(meetingId, toAdd, chairmanUserId).catch((err) =>
        console.warn("[meeting-chat] assignAgendaToUserIds:", err)
      );
    }
    return { chatId: meeting.groupChat.id, created: false };
  }

  const chat = await prisma.chat.create({
    data: {
      type: ChatType.GROUP,
      name: `Заседание №${meeting.number ?? meeting.id.slice(0, 8)}`,
      description: `Чат участников заседания для согласования и обсуждения`,
      isPublic: false,
      createdById: chairmanUserId,
      meetingId: meeting.id,
    },
  });

  await prisma.chatParticipant.createMany({
    data: participantUserIds.map((userId) => ({
      chatId: chat.id,
      userId,
      role: userId === chairmanUserId ? "admin" : "member",
      invitedById: chairmanUserId,
    })),
  });

  return { chatId: chat.id, created: true };
}

/**
 * Публикует системное сообщение в чате заседания (стадия согласования, согласовал/отклонил и т.д.).
 * Отправитель — председатель (или переданный senderId).
 */
export async function postMeetingChatSystemMessage(
  meetingId: string,
  content: string,
  senderId?: string
): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      groupChat: { select: { id: true } },
      participants: {
        where: { role: "CHAIRMAN", userId: { not: null } },
        include: { user: { select: { id: true } } },
      },
    },
  });

  if (!meeting?.groupChat) return;

  const chairmanUserId =
    meeting.participants.find((p) => p.user?.id)?.user?.id ?? meeting.createdById;
  const effectiveSenderId = senderId ?? chairmanUserId;
  if (!effectiveSenderId) return;

  const message = await prisma.chatMessage.create({
    data: {
      chatId: meeting.groupChat.id,
      senderId: effectiveSenderId,
      content,
      messageType: "system",
    },
  });

  await prisma.chat.update({
    where: { id: meeting.groupChat.id },
    data: {
      lastMessageId: message.id,
      lastMessageAt: new Date(),
    },
  });
}
