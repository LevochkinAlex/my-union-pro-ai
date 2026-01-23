/**
 * Скрипт для исправления обращений без начального сообщения в чате
 * Создает сообщения с текстом и фото для обращений, у которых их нет
 * 
 * Запуск: pnpm dotenv -e .env.local -- node scripts/fix-missing-appeal-messages.mjs
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingAppealMessages() {
  console.log('🔧 Исправление обращений без начального сообщения в чате\n');

  try {
    // Находим все обращения с чатами, но без начальных сообщений
    const tickets = await prisma.ticket.findMany({
      where: {
        chatId: { not: null },
      },
      include: {
        chat: {
          include: {
            messages: {
              where: {
                messageType: 'text',
                content: { contains: 'Обращение #' },
              },
              take: 1,
            },
          },
        },
        attachments: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    console.log(`📊 Найдено обращений с чатами: ${tickets.length}\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const ticket of tickets) {
      // Проверяем, есть ли уже сообщение с текстом обращения
      const hasInitialMessage = ticket.chat?.messages && ticket.chat.messages.length > 0;

      if (hasInitialMessage) {
        console.log(`⏭️  Пропущено обращение #${ticket.publicId} - сообщение уже есть`);
        skipped++;
        continue;
      }

      try {
        // Форматируем дату создания
        const createdAt = new Date(ticket.createdAt);
        const dateStr = createdAt.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const timeStr = createdAt.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Создаем начальное сообщение с полной информацией об обращении
        let initialMessage = `**Обращение #${ticket.publicId}**\n\n`;
        initialMessage += `**Тема:** ${ticket.title}\n\n`;
        initialMessage += `**Текст обращения:**\n${ticket.content}\n\n`;
        initialMessage += `**Дата и время создания:** ${dateStr} в ${timeStr}`;

        // Подготавливаем вложения
        let messageAttachments = undefined;
        if (ticket.attachments && ticket.attachments.length > 0) {
          messageAttachments = {
            create: ticket.attachments.map(att => {
              // Преобразуем путь тикета в путь чата
              let chatPath = att.filePath;
              if (att.filePath?.includes('/uploads/tickets/')) {
                chatPath = att.filePath.replace('/uploads/tickets/', '/uploads/chat/');
              }

              const isImage = att.mimeType?.startsWith('image/');
              return {
                type: isImage ? 'image' : 'file',
                url: chatPath,
                name: att.fileName,
                size: att.fileSize,
                mimeType: att.mimeType || 'application/octet-stream',
              };
            }),
          };
        }

        // Создаем сообщение
        const messageData = {
          chatId: ticket.chatId!,
          senderId: ticket.userId,
          content: initialMessage,
          messageType: 'text',
          ...(messageAttachments && { attachments: messageAttachments }),
        };

        const createdMessage = await prisma.chatMessage.create({
          data: messageData,
        });

        // Обновляем lastMessageId в чате
        await prisma.chat.update({
          where: { id: ticket.chatId! },
          data: {
            lastMessageId: createdMessage.id,
            lastMessageAt: createdMessage.createdAt,
          },
        });

        console.log(`✅ Исправлено обращение #${ticket.publicId}: создано сообщение ${createdMessage.id} с ${ticket.attachments?.length || 0} вложениями`);
        fixed++;
      } catch (error) {
        console.error(`❌ Ошибка при исправлении обращения #${ticket.publicId}:`, error.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Итоги:');
    console.log(`   ✅ Исправлено: ${fixed}`);
    console.log(`   ⏭️  Пропущено: ${skipped}`);
    console.log(`   ❌ Ошибок: ${errors}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingAppealMessages();
