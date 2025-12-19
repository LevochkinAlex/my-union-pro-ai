/**
 * Серверные утилиты для чата
 * ВАЖНО: Этот файл содержит Prisma и должен использоваться ТОЛЬКО на сервере!
 * НЕ импортировать в клиентские компоненты!
 * 
 * DEPRECATED: Этот файл оставлен для обратной совместимости.
 * Используйте lib/chat-service.ts для новых функций.
 */

import { prisma } from "@/lib/prisma";
import { 
  getOrCreatePrivateChat as newGetOrCreatePrivateChat,
  sendMessage,
} from "@/lib/chat-service";

/**
 * @deprecated Используйте getOrCreatePrivateChat из lib/chat-service.ts
 * Создает или находит личный чат между двумя пользователями
 */
export async function getOrCreatePrivateChat(
  userId1: string,
  userId2: string
) {
  const { chat } = await newGetOrCreatePrivateChat(userId1, userId2);
  return chat;
}

/**
 * Отправляет сообщение в чат и обновляет последнее сообщение
 * @param chatId ID чата
 * @param senderId ID отправителя
 * @param content Содержимое сообщения
 */
export async function sendChatMessage(
  chatId: string,
  senderId: string,
  content: string
) {
  // Получаем информацию о чате для определения, кого пометить как непрочитанное
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { participant1Id: true, participant2Id: true },
  });

  // Определяем, кого пометить как непрочитанное
  const updateData: any = {
    lastMessageAt: new Date(),
    lastMessage: content.length > 100 ? content.substring(0, 100) + "..." : content,
  };

  if (chat?.participant1Id === senderId) {
    updateData.participant2ReadAt = null;
  } else if (chat?.participant2Id === senderId) {
    updateData.participant1ReadAt = null;
  }

  // Создаем сообщение и обновляем чат параллельно
  await Promise.all([
    prisma.chatMessage.create({
      data: {
        chatId,
        senderId,
        content,
      },
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: updateData,
    }),
  ]);

  // Также сбрасываем readAt в ChatParticipant
  await prisma.chatParticipant.updateMany({
    where: {
      chatId,
      userId: { not: senderId },
      leftAt: null,
    },
    data: {
      readAt: null,
    },
  });
}
