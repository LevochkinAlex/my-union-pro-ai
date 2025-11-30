#!/usr/bin/env node

/**
 * Скрипт для полного удаления пользователя по номеру телефона
 * 
 * Usage:
 *   CONFIRM_DELETE=YES pnpm dotenv -e .env.local -- tsx scripts/delete-user-by-phone.ts "+79639771286"
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function deleteUserByPhone(phone: string) {
  try {
    // Нормализуем номер телефона
    const normalizePhone = (phone: string): string => {
      let cleaned = phone.replace(/[\s\-\(\)\+]/g, "");
      if (cleaned.startsWith("8")) {
        cleaned = "7" + cleaned.slice(1);
      }
      if (!cleaned.startsWith("7")) {
        cleaned = "7" + cleaned;
      }
      return "+" + cleaned;
    };

    const normalizedPhone = normalizePhone(phone);
    console.log(`🔍 Ищу пользователя с номером: ${normalizedPhone}`);

    // Ищем пользователя по номеру телефона
    const user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: {
        documents: true,
        chatSessions: true,
        chatMessages: true,
        appeals: true,
        membershipHistory: true,
        phoneHistory: true,
        smsPinCodes: true,
        loginTokens: true,
        emailPinCodes: true,
        pushSubscriptions: true,
        discountPreference: true,
        newsPosts: true,
        newsLikes: true,
        newsComments: true,
        newsPollVotes: true,
        systemLogs: true,
        resolvedLogs: true,
        updatedSettings: true,
        uploadedKnowledgeDocuments: true,
      },
    });

    if (!user) {
      console.error(`❌ Пользователь с номером ${normalizedPhone} не найден`);
      process.exit(1);
    }

    console.log('\n🔍 Найден пользователь:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   Телефон: ${user.phone || 'N/A'}`);
    console.log(`   Telegram: ${user.telegramChatId || 'N/A'}`);
    console.log(`\n📊 Статистика данных:`);
    console.log(`   Документы: ${user.documents.length}`);
    console.log(`   Чат-сессии: ${user.chatSessions.length}`);
    console.log(`   Сообщения чата: ${user.chatMessages.length}`);
    console.log(`   Обращения: ${user.appeals.length}`);
    console.log(`   История членства: ${user.membershipHistory.length}`);
    console.log(`   История телефонов: ${user.phoneHistory.length}`);
    console.log(`   SMS коды: ${user.smsPinCodes.length}`);
    console.log(`   Токены: ${user.loginTokens.length}`);
    console.log(`   Email коды: ${user.emailPinCodes.length}`);
    console.log(`   Push подписки: ${user.pushSubscriptions.length}`);
    console.log(`   Новости (автор): ${user.newsPosts.length}`);
    console.log(`   Лайки: ${user.newsLikes.length}`);
    console.log(`   Комментарии: ${user.newsComments.length}`);
    console.log(`   Голоса в опросах: ${user.newsPollVotes.length}`);
    console.log(`   Системные логи: ${user.systemLogs.length + user.resolvedLogs.length}`);

    // Подтверждение
    console.log('\n⚠️  ВНИМАНИЕ: Это действие необратимо!');
    console.log('   Все данные пользователя будут удалены навсегда.');
    console.log('   Включая документы, чаты, обращения и т.д.\n');

    if (process.env.CONFIRM_DELETE !== 'YES') {
      console.log('❌ Удаление отменено. Для подтверждения установите CONFIRM_DELETE=YES');
      console.log(`   Пример: CONFIRM_DELETE=YES pnpm dotenv -e .env.local -- tsx scripts/delete-user-by-phone.ts "${normalizedPhone}"`);
      process.exit(1);
    }

    console.log('🗑️  Начинаю удаление...\n');

    // Удаляем все данные в транзакции
    await prisma.$transaction(async (tx) => {
      // 1. Удаляем физические файлы документов
      for (const doc of user.documents) {
        if (doc.filePath) {
          const fullPath = path.join(process.cwd(), 'public', doc.filePath);
          try {
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              console.log(`   ✅ Удален файл: ${doc.filePath}`);
            }
          } catch (error) {
            console.warn(`   ⚠️  Не удалось удалить файл ${doc.filePath}:`, error);
          }
        }
      }

      // 2. Удаляем подпись пользователя
      if (user.signaturePath) {
        const signatureFullPath = path.join(process.cwd(), 'public', user.signaturePath);
        try {
          if (fs.existsSync(signatureFullPath)) {
            fs.unlinkSync(signatureFullPath);
            console.log(`   ✅ Удалена подпись: ${user.signaturePath}`);
          }
        } catch (error) {
          console.warn(`   ⚠️  Не удалось удалить подпись ${user.signaturePath}:`, error);
        }
      }

      // 3. Удаляем аватар
      if (user.avatarUrl && user.avatarUrl.startsWith('/')) {
        const avatarFullPath = path.join(process.cwd(), 'public', user.avatarUrl);
        try {
          if (fs.existsSync(avatarFullPath)) {
            fs.unlinkSync(avatarFullPath);
            console.log(`   ✅ Удален аватар: ${user.avatarUrl}`);
          }
        } catch (error) {
          console.warn(`   ⚠️  Не удалось удалить аватар ${user.avatarUrl}:`, error);
        }
      }

      // 4. Удаляем все связанные записи
      await tx.document.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено документов: ${user.documents.length}`);

      await tx.chatSession.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено чат-сессий: ${user.chatSessions.length}`);

      await tx.chatMessage.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено сообщений чата: ${user.chatMessages.length}`);

      await tx.userAppeal.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено обращений: ${user.appeals.length}`);

      await tx.membershipHistory.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено записей истории членства: ${user.membershipHistory.length}`);

      await tx.phoneHistory.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено записей истории телефонов: ${user.phoneHistory.length}`);

      await tx.sMSPinCode.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено SMS кодов: ${user.smsPinCodes.length}`);

      await tx.loginToken.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено токенов: ${user.loginTokens.length}`);

      await tx.emailPinCode.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено email кодов: ${user.emailPinCodes.length}`);

      await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено push подписок: ${user.pushSubscriptions.length}`);

      if (user.discountPreference) {
        await tx.discountPreference.delete({ where: { userId: user.id } });
        console.log(`   ✅ Удалены предпочтения скидок`);
      }

      // Новости - удаляем, так как authorId обязателен
      await tx.newsPost.deleteMany({ where: { authorId: user.id } });
      console.log(`   ✅ Удалено новостей: ${user.newsPosts.length}`);

      await tx.newsLike.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено лайков: ${user.newsLikes.length}`);

      await tx.newsComment.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено комментариев: ${user.newsComments.length}`);

      await tx.newsPollVote.deleteMany({ where: { userId: user.id } });
      console.log(`   ✅ Удалено голосов: ${user.newsPollVotes.length}`);

      await tx.systemLog.updateMany({ 
        where: { resolvedBy: user.id },
        data: { resolvedBy: null }
      });
      console.log(`   ✅ Обновлено системных логов (удален resolvedBy): ${user.resolvedLogs.length}`);

      await tx.systemLog.updateMany({ 
        where: { userId: user.id },
        data: { userId: null }
      });
      console.log(`   ✅ Обновлено системных логов (удален userId): ${user.systemLogs.length}`);

      await tx.systemSetting.updateMany({ 
        where: { updatedByUserId: user.id },
        data: { updatedByUserId: null }
      });
      console.log(`   ✅ Обновлено настроек системы (удален updatedBy): ${user.updatedSettings.length}`);

      await tx.knowledgeDocument.updateMany({ 
        where: { uploadedByUserId: user.id },
        data: { uploadedByUserId: null }
      });
      console.log(`   ✅ Обновлено документов базы знаний (удален uploadedBy): ${user.uploadedKnowledgeDocuments.length}`);

      // 5. Удаляем самого пользователя
      await tx.user.delete({ where: { id: user.id } });
      console.log(`   ✅ Удален пользователь: ${user.id}`);
    });

    console.log('\n✅ Пользователь и все его данные успешно удалены!');
    console.log(`   ID: ${user.id}`);
    console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
    console.log(`   Телефон: ${normalizedPhone}`);

  } catch (error) {
    console.error('\n❌ Ошибка при удалении:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Парсим аргументы
const args = process.argv.slice(2);

if (args.length === 1) {
  deleteUserByPhone(args[0]);
} else {
  console.error('❌ Использование:');
  console.error('   CONFIRM_DELETE=YES pnpm dotenv -e .env.local -- tsx scripts/delete-user-by-phone.ts "+79639771286"');
  console.error('\n⚠️  Для подтверждения установите CONFIRM_DELETE=YES');
  process.exit(1);
}

