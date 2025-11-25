#!/usr/bin/env tsx
/**
 * Скрипт для полной очистки данных пользователя без удаления аккаунта
 * Использование: pnpm tsx scripts/reset-user-data.ts <email>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetUserData(email: string) {
  console.log('\n' + '═'.repeat(80));
  console.log('🧹 ПОЛНАЯ ОЧИСТКА ДАННЫХ ПОЛЬЗОВАТЕЛЯ');
  console.log('═'.repeat(80));
  console.log(`Email: ${email}\n`);

  try {
    // Найти пользователя
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true }
    });

    if (!user) {
      console.log('❌ Пользователь не найден!');
      return;
    }

    console.log(`✅ Пользователь найден: ${user.firstName || ''} ${user.lastName || ''} (${user.email})`);
    console.log(`   ID: ${user.id}\n`);

    // 1. Удалить все сообщения
    console.log('1️⃣  Удаление сообщений чата...');
    const deletedMessages = await prisma.chatMessage.deleteMany({
      where: { userId: user.id }
    });
    console.log(`   ✅ Удалено сообщений: ${deletedMessages.count}`);

    // 2. Удалить все сессии чата
    console.log('\n2️⃣  Удаление сессий чата...');
    const deletedSessions = await prisma.chatSession.deleteMany({
      where: { userId: user.id }
    });
    console.log(`   ✅ Удалено сессий: ${deletedSessions.count}`);

    // 3. Удалить все документы
    console.log('\n3️⃣  Удаление документов...');
    const deletedDocuments = await prisma.document.deleteMany({
      where: { userId: user.id }
    });
    console.log(`   ✅ Удалено документов: ${deletedDocuments.count}`);

    // 4. Очистить профиль (но не удалять аккаунт и не трогать email/пароль)
    console.log('\n4️⃣  Очистка профиля...');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // Базовая информация
        firstName: null,
        lastName: null,
        middleName: null,
        dateOfBirth: null,
        phone: null,
        address: null,
        region: null,
        
        // Работа
        organization: { disconnect: true }, // Отключаем связь с организацией
        organizationName: null,
        jobTitle: null,
        profession: null,
        education: null,
        employmentStatus: null,
        
        // Дополнительная информация
        maritalStatus: null,
        spouseInfo: null,
        hasChildren: null,
        childrenBirthDates: null,
        childrenInfo: null,
        hobbies: null,
        aboutMe: null,
        additionalInfo: null,
        awards: null,
        training: null,
        
        // Статусы и метаданные
        signaturePath: null,
        profileChangedAfterDocuments: false,
        profileLastModified: null,
        
        // Не трогаем: email, password, role, membershipStatus, createdAt, updatedAt
      }
    });
    console.log('   ✅ Профиль очищен');

    console.log('\n' + '═'.repeat(80));
    console.log('✅✅✅ ДАННЫЕ УСПЕШНО ОЧИЩЕНЫ ✅✅✅');
    console.log('═'.repeat(80));
    console.log('\n💡 Теперь можно войти и начать заново!');
    console.log(`   Email: ${email}`);
    console.log('   Пароль: тот же что был\n');

  } catch (error) {
    console.error('\n❌ Ошибка при очистке данных:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Получаем email из аргументов командной строки
const email = process.argv[2];

if (!email) {
  console.log('\n❌ Не указан email пользователя!');
  console.log('\nИспользование:');
  console.log('  pnpm tsx scripts/reset-user-data.ts <email>');
  console.log('\nПример:');
  console.log('  pnpm tsx scripts/reset-user-data.ts ceo@yappix.ru\n');
  process.exit(1);
}

resetUserData(email).catch(console.error);

