/**
 * Серверные утилиты для чата
 * ВАЖНО: Этот файл содержит Prisma и должен использоваться ТОЛЬКО на сервере!
 * НЕ импортировать в клиентские компоненты!
 */

import { prisma } from "@/lib/prisma";

/**
 * Создает или находит личный чат между двумя пользователями
 * Нормализует ID участников: меньший ID всегда будет participant1Id
 * @param userId1 ID первого пользователя
 * @param userId2 ID второго пользователя
 * @returns Chat объект
 */
export async function getOrCreatePrivateChat(
  userId1: string,
  userId2: string
) {
  // Нормализуем ID участников: меньший ID всегда participant1Id
  const participant1Id = userId1 < userId2 ? userId1 : userId2;
  const participant2Id = userId1 < userId2 ? userId2 : userId1;

  // Ищем существующий чат
  let chat = await prisma.chat.findFirst({
    where: {
      type: "PRIVATE",
      participant1Id,
      participant2Id,
    },
  });

  // Если чат не найден, создаем новый
  if (!chat) {
    chat = await prisma.chat.create({
      data: {
        type: "PRIVATE",
        participant1Id,
        participant2Id,
      },
    });
  }

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
}

