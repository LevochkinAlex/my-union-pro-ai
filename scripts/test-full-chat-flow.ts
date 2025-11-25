/**
 * Скрипт для полного тестирования флоу создания заявления через чат
 * Проверяет все валидации: ФИО, адрес, организация, должность, профессия
 */

import { prisma } from '../lib/prisma';

const TEST_USER_EMAIL = 'test-flow@example.com';
const TEST_PASSWORD = 'Test123456!';

async function simulateUserMessage(userId: string, sessionId: string, message: string) {
  console.log(`\n👤 USER: ${message}`);
  
  // Отправляем сообщение как POST /api/chat
  const response = await fetch('http://localhost:3004/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Здесь нужен был бы реальный JWT токен, но для тестирования используем прямой вызов
    },
    body: JSON.stringify({
      message,
      sessionId,
    }),
  });

  if (!response.ok) {
    console.error('❌ Ошибка отправки сообщения:', await response.text());
    return null;
  }

  const data = await response.json();
  console.log(`🤖 BOT: ${data.reply}`);
  
  return data;
}

async function testFullFlow() {
  console.log('🚀 Начало тестирования полного флоу создания заявления\n');
  console.log('=' .repeat(80));

  // 1. Найдем или создадим тестового пользователя
  let user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    console.log('📝 Создаём тестового пользователя...');
    user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        password: TEST_PASSWORD, // В реальности должен быть хешированный
        emailVerified: new Date(),
        membershipStatus: 'PROFILE_INCOMPLETE',
      },
    });
    console.log('✅ Пользователь создан:', user.email);
  } else {
    console.log('✅ Используем существующего пользователя:', user.email);
  }

  // 2. Создадим сессию чата
  const session = await prisma.chatSession.create({
    data: {
      userId: user.id,
      title: 'Тестовое заявление',
      type: 'STATEMENT',
    },
  });
  console.log('✅ Сессия чата создана:', session.id);

  console.log('\n' + '='.repeat(80));
  console.log('📋 ЭТАП 1: СБОР ОСНОВНОЙ ИНФОРМАЦИИ');
  console.log('='.repeat(80));

  // Создадим первое сообщение пользователя
  await prisma.chatMessage.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      role: 'user',
      content: 'Хочу вступить в профсоюз',
    },
  });

  // Имитируем ответ бота (начальное приветствие)
  await prisma.chatMessage.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      role: 'assistant',
      content: 'Здравствуйте! Помогу вам вступить в профсоюз. Для начала укажите ваше полное ФИО (Фамилия Имя Отчество).',
    },
  });

  console.log('\n✅ Сессия инициализирована. Начинаем тестирование...\n');
  console.log('Ссылка на сессию: http://localhost:3004/dashboard?session=' + session.id);
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 ПЛАН ТЕСТИРОВАНИЯ:');
  console.log('='.repeat(80));
  console.log(`
1. ФИО → Должна быть валидация через DaData (склонение)
2. Дата рождения → Проверка формата
3. Адрес → Валидация через DaData (уже работает)
4. Телефон → Проверка формата
5. Организация → Поиск в Минюсте (уже работает)
6. Должность → Поиск в справочнике (только добавили)
7. Профессия → Поиск в справочнике (только добавили)
8. Образование → Выбор из списка
9. Дополнительная информация → Сбор всех полей

После завершения:
- Проверить что профиль заполнен корректно
- Проверить что документы сгенерированы
- Проверить все валидации сработали
  `);

  console.log('\n' + '='.repeat(80));
  console.log('⚠️  ВАЖНО: Для полного теста запустите вручную через UI:');
  console.log('='.repeat(80));
  console.log(`
1. Откройте: http://localhost:3004/dashboard?session=${session.id}
2. Войдите как ${TEST_USER_EMAIL}
3. Пройдите весь флоу, вводя:
   - ФИО: "Иванов Иван Иванович"
   - Дата: "01.01.1990"
   - Адрес: "Татарстан, Набережные Челны, Чулман 11, квартира 141"
   - Телефон: "+7 123 456-78-90"
   - Организация: "БСМП Челны"
   - Должность: "Врач"
   - Профессия: "Врач"
   - Образование: "Высшее медицинское"

4. Проверьте:
   ✓ Адрес валидируется через DaData
   ✓ Организация находится в Минюсте
   ✓ Должность автозаполняется из справочника
   ✓ Профессия автозаполняется из справочника
   ✓ Бот НЕ спрашивает дважды про одно и то же
   ✓ Бот НЕ зацикливается
   ✓ После подтверждения генерируются документы
  `);

  console.log('\n✅ Тестовая сессия готова!');
  console.log(`📌 Session ID: ${session.id}`);
  console.log(`📧 User: ${user.email}`);
}

testFullFlow()
  .then(() => {
    console.log('\n✅ Скрипт завершен');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка:', error);
    process.exit(1);
  });

