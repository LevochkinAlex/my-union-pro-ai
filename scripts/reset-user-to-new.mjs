#!/usr/bin/env node

/**
 * Скрипт для полного сброса пользователя к состоянию "только зарегистрировался"
 * Usage: node scripts/reset-user-to-new.mjs <email>
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Загружаем переменные окружения из .env.local
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function resetUserToNew(email) {
  try {
    console.log(`🔄 Сброс пользователя: ${email}...`);

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: true,
        chatMessages: true,
        chatSessions: true,
      }
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`📊 Информация о пользователе:`);
    console.log(`   Имя: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Документов: ${user.documents.length}`);
    console.log(`   Сообщений: ${user.chatMessages.length}`);
    console.log(`   Сессий чата: ${user.chatSessions.length}`);
    console.log();

    // 1. Удаляем документы
    const deletedDocs = await prisma.document.deleteMany({
      where: { userId: user.id }
    });
    console.log(`✅ Удалено документов: ${deletedDocs.count}`);

    // 2. Удаляем все сообщения чата
    const deletedMessages = await prisma.chatMessage.deleteMany({
      where: { userId: user.id }
    });
    console.log(`✅ Удалено сообщений: ${deletedMessages.count}`);

    // 3. Удаляем все сессии чата
    const deletedSessions = await prisma.chatSession.deleteMany({
      where: { userId: user.id }
    });
    console.log(`✅ Удалено сессий: ${deletedSessions.count}`);

    // 4. Сбрасываем профиль пользователя (оставляем только email, пароль, роль)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // Очищаем личные данные
        firstName: null,
        middleName: null,
        lastName: null,
        dateOfBirth: null,
        phone: null,
        address: null,
        region: null,
        
        // Очищаем рабочие данные
        jobTitle: null,
        profession: null,
        education: null,
        
        // Отключаем связь с организацией
        organization: {
          disconnect: true
        },
        
        // Очищаем дополнительную информацию
        occupation: null,
        hobbies: null,
        aboutMe: null,
        hasChildren: null,
        childrenInfo: null,
        maritalStatus: null,
        spouseInfo: null,
        additionalInfo: null,
        
        // Очищаем данные BestBenefits
        bestBenefitsUserId: null,
        bestBenefitsStatus: null,
        bestBenefitsPassword: null,
        
        // Удаляем связанные данные
        discountPreference: {
          delete: true
        }
      }
    }).catch(async (err) => {
      // Если ошибка из-за отсутствия связей, пробуем без disconnect
      if (err.code === 'P2025' || err.message.includes('disconnect')) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            firstName: null,
            middleName: null,
            lastName: null,
            dateOfBirth: null,
            phone: null,
            address: null,
            region: null,
            jobTitle: null,
            profession: null,
            education: null,
            occupation: null,
            hobbies: null,
            aboutMe: null,
            hasChildren: null,
            childrenInfo: null,
            maritalStatus: null,
            spouseInfo: null,
            additionalInfo: null,
            bestBenefitsUserId: null,
            bestBenefitsStatus: null,
            bestBenefitsPassword: null,
          }
        });
      } else {
        throw err;
      }
    });
    console.log(`✅ Профиль пользователя сброшен`);

    console.log();
    console.log(`🎉 ГОТОВО! Пользователь ${email} сброшен к состоянию "только зарегистрировался"`);
    console.log(`   Сохранено: email, пароль, роль`);
    console.log(`   Удалено: все документы, сообщения, профиль`);
    console.log();
    console.log(`💡 Теперь пользователь может заново:`);
    console.log(`   1. Открыть "Мой бот"`);
    console.log(`   2. Заполнить профиль с нуля`);
    console.log(`   3. Сгенерировать новые документы`);

  } catch (error) {
    console.error('❌ Ошибка при сбросе пользователя:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Получаем email из аргументов командной строки
const email = process.argv[2];

if (!email) {
  console.error('❌ Не указан email пользователя');
  console.log('Usage: node scripts/reset-user-to-new.mjs <email>');
  console.log('Example: node scripts/reset-user-to-new.mjs ceo@yappix.ru');
  process.exit(1);
}

resetUserToNew(email);

