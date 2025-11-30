#!/usr/bin/env node

/**
 * Скрипт для очистки всех данных по номеру телефона
 * 
 * Usage:
 *   pnpm dotenv -e .env.local -- tsx scripts/cleanup-phone-data.ts +79639771286
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("8")) {
    cleaned = "+7" + cleaned.slice(1);
  }
  if (cleaned.startsWith("7") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

async function cleanupPhoneData(phone: string) {
  try {
    const normalizedPhone = normalizePhone(phone);
    console.log(`\n🔍 Очистка данных для номера: ${normalizedPhone}\n`);

    // Ищем пользователя по номеру
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: normalizedPhone.replace("+", "") },
          { phone: normalizedPhone.replace("+7", "7") },
          { phone: normalizedPhone.replace("+7", "8") },
          { authPhone: normalizedPhone },
          { authPhone: normalizedPhone.replace("+", "") },
        ],
      },
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
      },
    });

    if (user) {
      console.log(`📊 Найден пользователь:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Имя: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Телефон: ${user.phone || 'N/A'}`);
      console.log(`   Telegram: ${user.telegramChatId || 'N/A'}`);
      console.log(`\n📊 Статистика данных:`);
      console.log(`   Документы: ${user.documents.length}`);
      console.log(`   Чат-сессии: ${user.chatSessions.length}`);
      console.log(`   Сообщения: ${user.chatMessages.length}`);
      console.log(`   SMS коды: ${user.smsPinCodes.length}`);
      console.log(`   Токены: ${user.loginTokens.length}`);
    } else {
      console.log(`✅ Пользователь с номером ${normalizedPhone} не найден`);
    }

    // Ищем по SMS кодам
    const smsCodes = await prisma.sMSPinCode.findMany({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: normalizedPhone.replace("+", "") },
          { phone: normalizedPhone.replace("+7", "7") },
          { phone: normalizedPhone.replace("+7", "8") },
        ],
      },
    });

    console.log(`\n📊 Найдено SMS кодов: ${smsCodes.length}`);

    // Ищем по истории телефонов
    const phoneHistory = await prisma.phoneHistory.findMany({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: normalizedPhone.replace("+", "") },
          { phoneNormalized: normalizedPhone.replace(/\D/g, "") },
        ],
      },
    });

    console.log(`📊 Найдено записей истории телефонов: ${phoneHistory.length}`);

    if (process.env.CONFIRM_CLEANUP !== 'YES') {
      console.log('\n⚠️  Для очистки установите CONFIRM_CLEANUP=YES');
      console.log('   Пример: CONFIRM_CLEANUP=YES pnpm dotenv -e .env.local -- tsx scripts/cleanup-phone-data.ts +79639771286');
      return;
    }

    console.log('\n🗑️  Начинаю очистку...\n');

    await prisma.$transaction(async (tx) => {
      if (user) {
        // Удаляем все связанные данные
        await tx.document.deleteMany({ where: { userId: user.id } });
        await tx.chatSession.deleteMany({ where: { userId: user.id } });
        await tx.chatMessage.deleteMany({ where: { userId: user.id } });
        await tx.userAppeal.deleteMany({ where: { userId: user.id } });
        await tx.membershipHistory.deleteMany({ where: { userId: user.id } });
        await tx.phoneHistory.deleteMany({ where: { userId: user.id } });
        await tx.sMSPinCode.deleteMany({ where: { userId: user.id } });
        await tx.loginToken.deleteMany({ where: { userId: user.id } });
        await tx.emailPinCode.deleteMany({ where: { userId: user.id } });
        await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
        if (user.discountPreference) {
          await tx.discountPreference.delete({ where: { userId: user.id } });
        }
        await tx.newsLike.deleteMany({ where: { userId: user.id } });
        await tx.newsComment.deleteMany({ where: { userId: user.id } });
        await tx.newsPollVote.deleteMany({ where: { userId: user.id } });
        await tx.newsPost.deleteMany({ where: { authorId: user.id } });
        await tx.systemLog.updateMany({ where: { resolvedBy: user.id }, data: { resolvedBy: null } });
        await tx.systemLog.updateMany({ where: { userId: user.id }, data: { userId: null } });
        await tx.systemSetting.updateMany({ where: { updatedByUserId: user.id }, data: { updatedByUserId: null } });
        await tx.knowledgeDocument.updateMany({ where: { uploadedByUserId: user.id }, data: { uploadedByUserId: null } });
        
        // Удаляем пользователя
        await tx.user.delete({ where: { id: user.id } });
        console.log(`   ✅ Удален пользователь: ${user.id}`);
      }

      // Удаляем SMS коды по номеру
      const deletedSmsCodes = await tx.sMSPinCode.deleteMany({
        where: {
          OR: [
            { phone: normalizedPhone },
            { phone: normalizedPhone.replace("+", "") },
            { phone: normalizedPhone.replace("+7", "7") },
            { phone: normalizedPhone.replace("+7", "8") },
          ],
        },
      });
      console.log(`   ✅ Удалено SMS кодов: ${deletedSmsCodes.count}`);

      // Удаляем историю телефонов
      const deletedHistory = await tx.phoneHistory.deleteMany({
        where: {
          OR: [
            { phone: normalizedPhone },
            { phone: normalizedPhone.replace("+", "") },
            { phoneNormalized: normalizedPhone.replace(/\D/g, "") },
          ],
        },
      });
      console.log(`   ✅ Удалено записей истории: ${deletedHistory.count}`);
    });

    console.log('\n✅ Очистка завершена!');
    console.log(`   Номер ${normalizedPhone} готов для новой регистрации`);

  } catch (error) {
    console.error('\n❌ Ошибка при очистке:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Использование:');
  console.error('   tsx scripts/cleanup-phone-data.ts +79639771286');
  console.error('\n⚠️  Для подтверждения установите CONFIRM_CLEANUP=YES');
  process.exit(1);
}

cleanupPhoneData(args[0]);

