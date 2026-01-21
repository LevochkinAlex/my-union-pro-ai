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
  resetReadStatusForOthers,
  updateChatLastMessage,
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
 * @deprecated Эта функция больше не используется. Сообщения отправляются через API.
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
  console.warn('[sendChatMessage] DEPRECATED: Use API endpoint instead');
  
  // Обновляем lastMessageAt в чате
  await updateChatLastMessage(chatId);

  // Сбрасываем readAt для других участников
  await resetReadStatusForOthers(chatId, senderId);
}
