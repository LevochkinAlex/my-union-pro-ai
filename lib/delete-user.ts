/**
 * Полное удаление пользователя из системы.
 * Удаляются: аккаунт, его документы, обращения, участие в чатах, сообщения в чатах,
 * уведомления, подписки и прочие связи (за счёт onDelete в схеме).
 * Вызывать только из супер-админки.
 */

import { PrismaClient } from "@prisma/client";

export interface DeleteUserResult {
  ok: boolean;
  error?: string;
}

/**
 * Удалить пользователя по ID. Все связанные данные удаляются или обнуляются
 * в соответствии с onDelete в схеме (Cascade / SetNull).
 */
export async function deleteUser(
  prisma: PrismaClient,
  userId: string
): Promise<DeleteUserResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    return { ok: false, error: "Пользователь не найден" };
  }

  await prisma.$transaction(async (tx) => {
    // Участники чатов: помечаем как «Удалённый пользователь», затем User удалится и userId станет null (SetNull).
    await tx.chatParticipant.updateMany({
      where: { userId },
      data: { deletedUserDisplayName: "Удалённый пользователь" },
    });
    // Удаляем реакции и «прочитано» пользователя (могут блокировать удаление User без onDelete в БД).
    await tx.chatMessageReaction.deleteMany({ where: { userId } });
    await tx.chatMessageRead.deleteMany({ where: { userId } });
    // Удаляем сообщения пользователя в чатах (и их вложения/реакции/прочитано каскадно).
    await tx.chatMessage.deleteMany({ where: { senderId: userId } });

    // Обнуляем ссылки, которые могут мешать удалению (на случай старых миграций без onDelete).
    await tx.chat.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.chatParticipant.updateMany({ where: { invitedById: userId }, data: { invitedById: null } });
    await tx.documentTemplate.updateMany({
      where: { createdByUserId: userId },
      data: { createdByUserId: null },
    });
    await tx.documentTemplate.updateMany({
      where: { updatedByUserId: userId },
      data: { updatedByUserId: null },
    });
    await tx.meeting.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.meetingAgendaItem.updateMany({
      where: { OR: [{ speakerId: userId }, { coSpeakerId: userId }] },
      data: { speakerId: null, coSpeakerId: null },
    });
    await tx.meetingAgendaVote.updateMany({ where: { userId }, data: { userId: null } });
    await tx.knowledgeDocument.updateMany({ where: { uploadedByUserId: userId }, data: { uploadedByUserId: null } });
    await tx.systemSetting.updateMany({ where: { updatedByUserId: userId }, data: { updatedByUserId: null } });

    // Удаление пользователя — каскадно удалятся документы, тикеты, участники чатов,
    // уведомления, подписки, OrganizationStaff и т.д.
    await tx.user.delete({ where: { id: userId } });
  });

  return { ok: true };
}
