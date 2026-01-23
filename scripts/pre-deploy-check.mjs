/**
 * Комплексная проверка перед деплоем
 * Проверяет все критические компоненты системы
 * 
 * Запуск: pnpm dotenv -e .env.local -- node scripts/pre-deploy-check.mjs
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
};

function logCheck(name, passed, message, isWarning = false) {
  if (passed) {
    console.log(`✅ ${name}: ${message}`);
    checks.passed++;
  } else if (isWarning) {
    console.log(`⚠️  ${name}: ${message}`);
    checks.warnings++;
  } else {
    console.log(`❌ ${name}: ${message}`);
    checks.failed++;
    checks.errors.push({ check: name, message });
  }
}

async function runChecks() {
  console.log('🔍 Комплексная проверка перед деплоем\n');
  console.log('='.repeat(60));

  // Проверка 1: TypeScript компиляция
  console.log('\n📋 Проверка 1: TypeScript компиляция');
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    logCheck('TypeScript', true, 'Нет ошибок компиляции');
  } catch (error) {
    logCheck('TypeScript', false, 'Ошибки компиляции TypeScript');
  }

  // Проверка 2: Prisma схема
  console.log('\n📋 Проверка 2: Prisma схема');
  try {
    execSync('npx prisma format', { stdio: 'pipe' });
    logCheck('Prisma Schema', true, 'Схема валидна');
  } catch (error) {
    logCheck('Prisma Schema', false, 'Ошибки в схеме Prisma');
  }

  // Проверка 3: База данных
  console.log('\n📋 Проверка 3: Подключение к БД');
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    logCheck('Database Connection', true, `Подключено (пользователей: ${userCount})`);
  } catch (error) {
    logCheck('Database Connection', false, `Ошибка подключения: ${error.message}`);
  }

  // Проверка 4: Критические API endpoints
  console.log('\n📋 Проверка 4: Критические API endpoints');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';
  
  const endpoints = [
    { path: '/api/tickets', name: 'Tickets API' },
    { path: '/api/chat', name: 'Chat API' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      // 401 или 200 - это нормально (требует авторизации или работает)
      if (response.status === 401 || response.status === 200 || response.status === 405) {
        logCheck(endpoint.name, true, `Endpoint доступен (${response.status})`);
      } else if (response.status >= 500) {
        logCheck(endpoint.name, false, `Серверная ошибка (${response.status})`);
      } else {
        logCheck(endpoint.name, true, `Endpoint отвечает (${response.status})`, true);
      }
    } catch (error) {
      logCheck(endpoint.name, false, `Ошибка: ${error.message}`);
    }
  }

  // Проверка 5: Структура БД для обращений
  console.log('\n📋 Проверка 5: Структура БД для обращений');
  try {
    const ticket = await prisma.ticket.findFirst({
      select: {
        id: true,
        publicId: true,
        chatId: true,
      },
    });

    if (ticket) {
      logCheck('Ticket Table', true, `Таблица существует (обращений: ${await prisma.ticket.count()})`);
      
      // Проверяем новые поля (без ошибки, если их нет)
      try {
        const withNewFields = await prisma.ticket.findFirst({
          select: {
            responseDeadline: true,
            isOverdue: true,
          },
        });
        logCheck('New Ticket Fields', true, 'Новые поля доступны');
      } catch (e) {
        if (e.message?.includes('Unknown field')) {
          logCheck('New Ticket Fields', false, 'Новые поля не найдены (миграция не применена)', true);
        } else {
          throw e;
        }
      }
    } else {
      logCheck('Ticket Table', true, 'Таблица существует (пуста)');
    }
  } catch (error) {
    logCheck('Ticket Table', false, `Ошибка: ${error.message}`);
  }

  // Проверка 6: Обращения с чатами
  console.log('\n📋 Проверка 6: Обращения с чатами');
  try {
    const ticketsWithChats = await prisma.ticket.findMany({
      where: { chatId: { not: null } },
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
      take: 10,
    });

    const total = ticketsWithChats.length;
    const withMessages = ticketsWithChats.filter(t => t.chat?.messages && t.chat.messages.length > 0).length;
    const withoutMessages = total - withMessages;

    if (total === 0) {
      logCheck('Appeal Messages', true, 'Нет обращений с чатами для проверки');
    } else if (withoutMessages === 0) {
      logCheck('Appeal Messages', true, `Все обращения (${total}) имеют начальные сообщения`);
    } else {
      logCheck(
        'Appeal Messages',
        false,
        `${withoutMessages} из ${total} обращений без начальных сообщений`,
        true
      );
      console.log('   💡 Запустите: node scripts/fix-missing-appeal-messages.mjs');
    }
  } catch (error) {
    logCheck('Appeal Messages', false, `Ошибка: ${error.message}`);
  }

  // Итоги
  console.log('\n' + '='.repeat(60));
  console.log('📊 Итоги проверки:');
  console.log(`   ✅ Пройдено: ${checks.passed}`);
  console.log(`   ⚠️  Предупреждений: ${checks.warnings}`);
  console.log(`   ❌ Провалено: ${checks.failed}`);

  if (checks.errors.length > 0) {
    console.log('\n❌ Критические ошибки:');
    checks.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.check}: ${err.message}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (checks.failed === 0) {
    console.log('✅ Все критические проверки пройдены!');
    console.log('🚀 Готово к деплою');
    return 0;
  } else {
    console.log('❌ Есть критические ошибки!');
    console.log('   Исправьте их перед деплоем');
    return 1;
  }
}

runChecks()
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
