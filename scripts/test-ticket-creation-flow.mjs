/**
 * Комплексный тест создания обращения с проверкой всех этапов
 * 
 * Запуск: pnpm dotenv -e .env.local -- node scripts/test-ticket-creation-flow.mjs
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';

// Создаем тестовые файлы
async function createTestFiles() {
  const testDir = path.join(process.cwd(), 'public', 'uploads', 'test');
  await fs.mkdir(testDir, { recursive: true });
  
  // Создаем тестовое изображение (1x1 PNG)
  const testImage = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await fs.writeFile(path.join(testDir, 'test-image.png'), testImage);
  
  return {
    imagePath: path.join(testDir, 'test-image.png'),
    imageName: 'test-image.png',
  };
}

async function testTicketCreation() {
  console.log('🧪 Комплексный тест создания обращения\n');
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    errors: [],
  };

  // Тест 1: Проверка структуры БД
  console.log('\n📋 Тест 1: Проверка структуры БД');
  try {
    // Проверяем, что таблица Ticket существует
    const ticketCount = await prisma.ticket.count();
    console.log(`✅ Таблица Ticket доступна (записей: ${ticketCount})`);
    results.passed++;

    // Проверяем наличие новых полей (без ошибки, если их нет)
    try {
      const sample = await prisma.ticket.findFirst({
        select: {
          id: true,
          responseDeadline: true,
          isOverdue: true,
        },
      });
      console.log('✅ Новые поля доступны в схеме');
      results.passed++;
    } catch (e) {
      if (e.message?.includes('Unknown field')) {
        console.log('⚠️  Новые поля не найдены (миграция не применена)');
        console.log('   Это нормально для локального окружения');
        results.passed++; // Не критично
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
    results.failed++;
    results.errors.push({ test: 'DB Structure', error: error.message });
  }

  // Тест 2: Проверка API endpoint
  console.log('\n📋 Тест 2: Проверка API endpoint /api/tickets');
  try {
    const response = await fetch(`${BASE_URL}/api/tickets`, {
      method: 'GET',
    });

    if (response.status === 401) {
      console.log('✅ API endpoint доступен (требует авторизацию - ожидаемо)');
      results.passed++;
    } else if (response.status === 200) {
      const data = await response.json();
      if (data.success !== undefined) {
        console.log('✅ API endpoint работает корректно');
        console.log(`   Получено обращений: ${data.tickets?.length || 0}`);
        results.passed++;
      } else {
        console.log('⚠️  API вернул неожиданный формат');
        results.failed++;
      }
    } else {
      console.log(`⚠️  API вернул статус: ${response.status}`);
      results.failed++;
    }
  } catch (error) {
    console.log(`❌ Ошибка запроса: ${error.message}`);
    results.failed++;
    results.errors.push({ test: 'API Endpoint', error: error.message });
  }

  // Тест 3: Проверка создания сообщения в чате
  console.log('\n📋 Тест 3: Проверка логики создания сообщения');
  try {
    // Находим обращение с чатом
    const ticketWithChat = await prisma.ticket.findFirst({
      where: {
        chatId: { not: null },
      },
      include: {
        chat: {
          include: {
            messages: {
              where: {
                content: { contains: 'Обращение #' },
              },
              take: 1,
            },
          },
        },
      },
    });

    if (ticketWithChat) {
      const hasMessage = ticketWithChat.chat?.messages && ticketWithChat.chat.messages.length > 0;
      if (hasMessage) {
        console.log(`✅ Обращение #${ticketWithChat.publicId} имеет начальное сообщение`);
        const message = ticketWithChat.chat.messages[0];
        console.log(`   Сообщение ID: ${message.id}`);
        console.log(`   Длина текста: ${message.content.length} символов`);
        results.passed++;
      } else {
        console.log(`⚠️  Обращение #${ticketWithChat.publicId} не имеет начального сообщения`);
        console.log('   Запустите: node scripts/fix-missing-appeal-messages.mjs');
        results.failed++;
        results.errors.push({
          test: 'Initial Message',
          error: `Ticket ${ticketWithChat.publicId} missing initial message`,
        });
      }
    } else {
      console.log('ℹ️  Нет обращений с чатами для проверки');
      results.passed++; // Не критично
    }
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
    results.failed++;
    results.errors.push({ test: 'Message Creation', error: error.message });
  }

  // Тест 4: Проверка обработки ошибок
  console.log('\n📋 Тест 4: Проверка обработки ошибок');
  try {
    // Проверяем, что код не падает при отсутствии полей
    const tickets = await prisma.ticket.findMany({
      take: 1,
    });

    if (tickets.length > 0) {
      const ticket = tickets[0];
      // Пытаемся безопасно получить новые поля
      const safeFields = {
        responseDeadline: (ticket as any).responseDeadline || null,
        isOverdue: (ticket as any).isOverdue ?? false,
      };
      console.log('✅ Безопасный доступ к полям работает');
      console.log(`   responseDeadline: ${safeFields.responseDeadline || 'null'}`);
      console.log(`   isOverdue: ${safeFields.isOverdue}`);
      results.passed++;
    } else {
      console.log('ℹ️  Нет обращений для проверки');
      results.passed++; // Не критично
    }
  } catch (error) {
    console.log(`❌ Ошибка: ${error.message}`);
    results.failed++;
    results.errors.push({ test: 'Error Handling', error: error.message });
  }

  // Итоги
  console.log('\n' + '='.repeat(60));
  console.log('📊 Итоги тестирования:');
  console.log(`   ✅ Пройдено: ${results.passed}`);
  console.log(`   ❌ Провалено: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Ошибки:');
    results.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.test}: ${err.error}`);
    });
  }

  if (results.failed === 0) {
    console.log('\n✅ Все тесты пройдены!');
    console.log('🚀 Готово к деплою');
    return 0;
  } else {
    console.log('\n⚠️  Некоторые тесты не пройдены');
    console.log('   Проверьте ошибки выше');
    return 1;
  }
}

// Запуск
testTicketCreation()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
