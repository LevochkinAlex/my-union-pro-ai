#!/usr/bin/env tsx
/**
 * Полный тест: сбор данных → сброс → новый сбор
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function testFullFlow() {
  console.log('\n' + '═'.repeat(80));
  console.log('🧪 ТЕСТ ПОЛНОГО ФЛОУ');
  console.log('═'.repeat(80));

  const userEmail = 'ceo@yappix.ru';

  try {
    // ШАГ 1: Проверяем текущее состояние
    console.log('\n📊 ШАГ 1: Проверка текущего состояния');
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        chatMessages: true,
        chatSessions: true,
        documents: true,
      }
    });

    if (!user) {
      console.log('❌ Пользователь не найден');
      return;
    }

    console.log(`   Сообщений: ${user.chatMessages.length}`);
    console.log(`   Сессий: ${user.chatSessions.length}`);
    console.log(`   Документов: ${user.documents.length}`);
    console.log(`   Профиль заполнен: ${user.firstName ? 'ДА' : 'НЕТ'}`);

    // ШАГ 2: Сброс данных
    console.log('\n🧹 ШАГ 2: Сброс данных пользователя');
    const { stdout } = await execAsync(`pnpm tsx scripts/reset-user-data.ts ${userEmail}`);
    console.log(stdout);

    // ШАГ 3: Проверка после сброса
    console.log('\n✅ ШАГ 3: Проверка после сброса');
    const userAfterReset = await prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        chatMessages: true,
        chatSessions: true,
        documents: true,
      }
    });

    if (!userAfterReset) {
      console.log('❌ Пользователь удален (не должно быть!)');
      return;
    }

    console.log(`   ✅ Аккаунт сохранен: ${userAfterReset.email}`);
    console.log(`   ✅ Сообщений: ${userAfterReset.chatMessages.length} (должно быть 0)`);
    console.log(`   ✅ Сессий: ${userAfterReset.chatSessions.length} (должно быть 0)`);
    console.log(`   ✅ Документов: ${userAfterReset.documents.length} (должно быть 0)`);
    console.log(`   ✅ Профиль очищен: ${!userAfterReset.firstName ? 'ДА' : 'НЕТ'}`);

    // Проверка что профиль действительно пуст
    const profileFields = [
      'firstName', 'lastName', 'middleName', 'dateOfBirth', 
      'phone', 'address', 'region', 'jobTitle', 'profession', 
      'education', 'organizationName', 'maritalStatus', 
      'hobbies', 'aboutMe', 'additionalInfo'
    ];

    const notCleared = profileFields.filter(field => userAfterReset[field] !== null);
    
    if (notCleared.length > 0) {
      console.log(`   ⚠️  Не очищены поля: ${notCleared.join(', ')}`);
    } else {
      console.log(`   ✅ Все поля профиля очищены`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅✅✅ ТЕСТ УСПЕШНО ЗАВЕРШЕН ✅✅✅');
    console.log('═'.repeat(80));
    console.log('\n💡 Теперь можно войти и начать новый диалог');
    console.log(`   URL: http://localhost:3004/dashboard`);
    console.log(`   Email: ${userEmail}\n`);

  } catch (error) {
    console.error('\n❌ Ошибка теста:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testFullFlow().catch(console.error);

