#!/usr/bin/env node

/**
 * Скрипт для очистки сообщений из конкретной сессии чата
 * Usage: node scripts/clear-session.mjs <sessionId>
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Загружаем переменные окружения из .env.local
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function clearSession(sessionId) {
  try {
    console.log(`🗑️  Очистка сессии: ${sessionId}...`);

    // Проверяем, существует ли сессия
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          }
        },
        _count: {
          select: {
            messages: true,
          }
        }
      }
    });

    if (!session) {
      console.error(`❌ Сессия с ID ${sessionId} не найдена`);
      process.exit(1);
    }

    console.log(`📊 Информация о сессии:`);
    console.log(`   Пользователь: ${session.user.firstName} ${session.user.lastName} (${session.user.email})`);
    console.log(`   Название: ${session.title}`);
    console.log(`   Тип: ${session.type}`);
    console.log(`   Сообщений: ${session._count.messages}`);
    console.log();

    // Удаляем все сообщения из сессии
    const result = await prisma.chatMessage.deleteMany({
      where: {
        sessionId: sessionId,
      },
    });

    console.log(`✅ Удалено ${result.count} сообщений из сессии ${sessionId}`);
    console.log(`   Сессия сохранена (очищена)`);

  } catch (error) {
    console.error('❌ Ошибка при очистке сессии:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Получаем ID сессии из аргументов командной строки
const sessionId = process.argv[2];

if (!sessionId) {
  console.error('❌ Не указан ID сессии');
  console.log('Usage: node scripts/clear-session.mjs <sessionId>');
  process.exit(1);
}

clearSession(sessionId);

