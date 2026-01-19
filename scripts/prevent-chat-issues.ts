/**
 * Модуль для предотвращения проблем с чатами
 * Используется в chat-service.ts и app/api/chat/route.ts
 */

import { prisma } from '@/lib/prisma';

/**
 * Проверяет валидность чата перед сохранением
 */
export async function validateChatBeforeCreate(data: {
  type: 'PRIVATE' | 'GROUP';
  participantIds: string[];
}): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Проверка 1: Для приватных чатов должно быть ровно 2 участника
  if (data.type === 'PRIVATE' && data.participantIds.length !== 2) {
    errors.push(`Приватный чат должен иметь ровно 2 участника, получено: ${data.participantIds.length}`);
  }

  // Проверка 2: Проверяем, что все пользователи существуют
  const users = await prisma.user.findMany({
    where: { id: { in: data.participantIds } },
    select: { id: true },
  });

  if (users.length !== data.participantIds.length) {
    const missingIds = data.participantIds.filter(
      id => !users.find(u => u.id === id)
    );
    errors.push(`Пользователи не найдены: ${missingIds.join(', ')}`);
  }

  // Проверка 3: Нет дубликатов
  const uniqueIds = [...new Set(data.participantIds)];
  if (uniqueIds.length !== data.participantIds.length) {
    errors.push('Дублирующиеся участники в списке');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Проверяет, не существует ли уже такой приватный чат
 */
export async function checkPrivateChatExists(
  userId1: string,
  userId2: string
): Promise<boolean> {
  const [firstUserId, secondUserId] = userId1 < userId2 
    ? [userId1, userId2] 
    : [userId2, userId1];

  const existingChat = await prisma.chat.findFirst({
    where: {
      type: 'PRIVATE',
      OR: [
        {
          participant1Id: firstUserId,
          participant2Id: secondUserId,
        },
        {
          AND: [
            {
              participants: {
                some: { userId: firstUserId, leftAt: null },
              },
            },
            {
              participants: {
                some: { userId: secondUserId, leftAt: null },
              },
            },
          ],
        },
      ],
    },
  });

  return !!existingChat;
}

/**
 * Проверяет, нет ли дублирующихся участников в чате
 */
export async function checkDuplicateParticipants(
  chatId: string
): Promise<{ hasDuplicates: boolean; duplicateUserIds: string[] }> {
  const participants = await prisma.chatParticipant.findMany({
    where: {
      chatId,
      leftAt: null,
    },
    select: { userId: true },
  });

  const userIds = participants.map(p => p.userId).filter(Boolean);
  const uniqueUserIds = [...new Set(userIds)];
  const duplicates = userIds.filter((id, index) => userIds.indexOf(id) !== index);

  return {
    hasDuplicates: uniqueUserIds.length !== userIds.length,
    duplicateUserIds: [...new Set(duplicates)],
  };
}
