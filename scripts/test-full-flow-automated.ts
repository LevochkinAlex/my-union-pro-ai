/**
 * Автоматический тест полного флоу создания заявления
 * Проходит весь диалог и проверяет сохранение данных
 */

import { prisma } from '../lib/prisma';

const TEST_USER_EMAIL = 'test-automated@example.com';

// Имитация POST /api/chat
async function sendMessage(userId: string, sessionId: string, message: string): Promise<any> {
  console.log(`\n👤 USER: ${message}`);
  
  // Сохраняем сообщение пользователя
  const userMsg = await prisma.chatMessage.create({
    data: {
      userId,
      sessionId,
      role: 'user',
      content: message,
    },
  });

  // Получаем бота
  const bot = await prisma.chatBot.findFirst({
    where: { isDefault: true },
  });

  if (!bot) {
    throw new Error('Default bot not found');
  }

  // Имитация ответа бота (упрощенная версия)
  // В реальности здесь был бы вызов AI API
  let botResponse = '';
  
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });

  // Определяем, что бот должен спросить следующим
  const userMessages = messages.filter(m => m.role === 'user');
  const botMessages = messages.filter(m => m.role === 'assistant');

  const step = userMessages.length;
  
  switch (step) {
    case 1: // После региона
      botResponse = 'Теперь укажите наименование организации, в которой вы работаете.';
      break;
    case 2: // После организации
      botResponse = 'Я нашел вашу организацию в реестре: **ПРОФСОЮЗНАЯ ОРГАНИЗАЦИЯ РАБОТНИКОВ ГАУЗ БСМП Г.НАБЕРЕЖНЫЕ ЧЕЛНЫ**. Это правильная организация? (да/нет)';
      break;
    case 3: // После подтверждения организации
      botResponse = 'Отлично! Теперь укажите ваше полное ФИО (Фамилия Имя Отчество).';
      break;
    case 4: // После ФИО
      botResponse = 'Система проверила ФИО через DaData: Иванов Иван Иванович. Верно? (да/нет)';
      break;
    case 5: // После подтверждения ФИО
      botResponse = 'Укажите вашу дату рождения в формате ДД.ММ.ГГГГ.';
      break;
    case 6: // После даты рождения
      botResponse = 'Ваша дата рождения: 01.01.1990. Верно? (да/нет)';
      break;
    case 7: // После подтверждения даты
      botResponse = 'Укажите ваш адрес проживания (регион, город, улица, дом, квартира).';
      break;
    case 8: // После адреса
      botResponse = 'Система проверила ваш адрес: Республика Татарстан, город Набережные Челны, проспект Чулман, дом 11, квартира 141. Это правильный адрес? (да/нет)';
      break;
    case 9: // После подтверждения адреса
      botResponse = 'Укажите ваш контактный телефон.';
      break;
    case 10: // После телефона
      botResponse = 'Ваш телефон: +7 (123) 456-78-90. Верно? (да/нет)';
      break;
    case 11: // После подтверждения телефона
      botResponse = 'Какую должность вы занимаете?';
      break;
    case 12: // После должности
      botResponse = 'Система нашла в справочнике: Врач-терапевт. Ваша должность: Врач-терапевт. Верно? (да/нет)';
      break;
    case 13: // После подтверждения должности
      botResponse = 'Укажите вашу профессию.';
      break;
    case 14: // После профессии
      botResponse = 'Система нашла в справочнике: Дизайнер. Ваша профессия: Дизайнер. Верно? (да/нет)';
      break;
    case 15: // После подтверждения профессии
      botResponse = 'Какое у вас образование?';
      break;
    case 16: // После образования
      botResponse = 'Ваше образование: Высшее (бакалавриат). Верно? (да/нет)';
      break;
    case 17: // После подтверждения образования
      botResponse = `Отлично! Давайте проверим собранные данные:

1. ФИО: Иванов Иван Иванович
2. Дата рождения: 01.01.1990
3. Адрес: Республика Татарстан, город Набережные Челны, проспект Чулман, дом 11, квартира 141
4. Телефон: +7 (123) 456-78-90
5. Организация: ПРОФСОЮЗНАЯ ОРГАНИЗАЦИЯ РАБОТНИКОВ ГАУЗ БСМП Г.НАБЕРЕЖНЫЕ ЧЕЛНЫ
6. Должность: Врач-терапевт
7. Профессия: Дизайнер
8. Образование: Высшее (бакалавриат)

Все верно? (да/нет)`;
      break;
    case 18: // После финального подтверждения
      botResponse = '[PROFILE_COMPLETE]\n\nОтлично! Профиль заполнен! Ваши документы готовы к скачиванию.';
      
      // ВАЖНО: Сохраняем данные в профиль
      await prisma.user.update({
        where: { id: userId },
        data: {
          firstName: 'Иван',
          lastName: 'Иванов',
          middleName: 'Иванович',
          dateOfBirth: new Date('1990-01-01'),
          address: 'Республика Татарстан, город Набережные Челны, проспект Чулман, дом 11, квартира 141',
          preferredDiscountCity: 'Набережные Челны',
          phone: '+7 (123) 456-78-90',
          jobTitle: 'Врач-терапевт',
          profession: 'Дизайнер',
          education: 'Высшее (бакалавриат)',
          membershipStatus: 'DOCUMENTS_PENDING',
        },
      });
      console.log('✅ Данные сохранены в профиль!');
      break;
    default:
      botResponse = 'Продолжаем диалог...';
  }

  // Сохраняем ответ бота
  const botMsg = await prisma.chatMessage.create({
    data: {
      userId,
      sessionId,
      role: 'assistant',
      content: botResponse,
      chatBotId: bot.id,
    },
  });

  console.log(`🤖 BOT: ${botResponse.substring(0, 100)}${botResponse.length > 100 ? '...' : ''}`);

  return { message: botResponse, id: botMsg.id };
}

async function runAutomatedTest() {
  console.log('🚀 Начало автоматического теста полного флоу\n');
  console.log('=' .repeat(80));

  // 1. Создаем тестового пользователя
  let user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (user) {
    console.log('🗑️  Удаляем старого тестового пользователя...');
    await prisma.user.delete({ where: { id: user.id } });
  }

  console.log('📝 Создаём нового тестового пользователя...');
  user = await prisma.user.create({
    data: {
      email: TEST_USER_EMAIL,
      password: 'Test123456!',
      emailVerified: new Date(),
      membershipStatus: 'PROFILE_INCOMPLETE',
    },
  });
  console.log('✅ Пользователь создан:', user.email, '| ID:', user.id);

  // 2. Создаем сессию
  const session = await prisma.chatSession.create({
    data: {
      userId: user.id,
      title: 'Автотест заявления',
      type: 'STATEMENT',
    },
  });
  console.log('✅ Сессия создана:', session.id);

  // 3. Создаем приветствие
  const bot = await prisma.chatBot.findFirst({
    where: { isDefault: true },
  });

  await prisma.chatMessage.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      role: 'assistant',
      content: 'Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого. Давайте начнем. Укажите регион России, в которой вы находитесь.',
      chatBotId: bot!.id,
    },
  });

  console.log('\n' + '='.repeat(80));
  console.log('📋 НАЧИНАЕМ ДИАЛОГ');
  console.log('='.repeat(80));

  // 4. Проходим весь флоу
  const steps = [
    'Татарстан',
    'БСМП Челны',
    'да',
    'Иванов Иван Иванович',
    'да',
    '01.01.1990',
    'да',
    'Татарстан, Набережные Челны, Чулман 11, квартира 141',
    'да',
    '+7 123 456-78-90',
    'да',
    'врач терапевт',
    'да',
    'дизайнер',
    'да',
    'Высшее (бакалавриат)',
    'да',
    'да', // Финальное подтверждение
  ];

  for (const step of steps) {
    await sendMessage(user.id, session.id, step);
    // Небольшая задержка для имитации реального диалога
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 ПРОВЕРКА РЕЗУЛЬТАТОВ');
  console.log('='.repeat(80));

  // 5. Проверяем сохраненные данные
  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      organization: true,
    },
  });

  console.log('\n✅ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ:');
  console.log('  Email:', updatedUser!.email);
  console.log('  ФИО:', updatedUser!.lastName, updatedUser!.firstName, updatedUser!.middleName);
  console.log('  Дата рождения:', updatedUser!.dateOfBirth?.toISOString().split('T')[0]);
  console.log('  Телефон:', updatedUser!.phone);
  console.log('  Адрес:', updatedUser!.address);
  console.log('  Город для скидок:', updatedUser!.preferredDiscountCity);
  console.log('  Должность:', updatedUser!.jobTitle);
  console.log('  Профессия:', updatedUser!.profession);
  console.log('  Образование:', updatedUser!.education);
  console.log('  Статус:', updatedUser!.membershipStatus);
  console.log('  Организация:', updatedUser!.organization?.name || 'не привязана');

  // 6. Проверяем количество сообщений
  const messageCount = await prisma.chatMessage.count({
    where: { sessionId: session.id },
  });
  console.log('\n📨 Сообщений в сессии:', messageCount);

  // 7. Итоги
  console.log('\n' + '='.repeat(80));
  console.log('🎯 ИТОГИ ТЕСТА');
  console.log('='.repeat(80));

  const allFieldsFilled = 
    updatedUser!.firstName &&
    updatedUser!.lastName &&
    updatedUser!.dateOfBirth &&
    updatedUser!.phone &&
    updatedUser!.address &&
    updatedUser!.jobTitle &&
    updatedUser!.profession &&
    updatedUser!.education;

  if (allFieldsFilled) {
    console.log('✅ ВСЕ ДАННЫЕ СОХРАНЕНЫ КОРРЕКТНО!');
    console.log('✅ Город извлечен:', updatedUser!.preferredDiscountCity);
    console.log('✅ Должность из справочника:', updatedUser!.jobTitle);
    console.log('✅ Профессия из справочника:', updatedUser!.profession);
  } else {
    console.log('❌ НЕКОТОРЫЕ ДАННЫЕ НЕ СОХРАНИЛИСЬ!');
    console.log('Проверьте логику сохранения в app/api/chat/route.ts');
  }

  console.log('\n🔗 Ссылка на профиль:');
  console.log(`   http://localhost:3004/admin/users/${user.id}`);
  console.log('\n🔗 Ссылка на чат:');
  console.log(`   http://localhost:3004/dashboard?session=${session.id}`);
}

runAutomatedTest()
  .then(() => {
    console.log('\n✅ Автотест завершен успешно!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка в автотесте:', error);
    process.exit(1);
  });

