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
 * @deprecated Эта функция больше не используется. Сообщения отправляются через Matrix API.
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
  // DEPRECATED: Эта функция больше не используется
  // Сообщения теперь отправляются через Matrix API
  // TODO: Удалить все вызовы этой функции из кода
  
  console.warn('[sendChatMessage] DEPRECATED: This function is no longer used. Messages are sent via Matrix API.');
  
  // Обновляем lastMessageAt в чате
  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageAt: new Date(),
    },
  });

  // Сбрасываем readAt в ChatParticipant для других участников
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
