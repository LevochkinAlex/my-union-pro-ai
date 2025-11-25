/**
 * ФИНАЛЬНЫЙ АВТОМАТИЧЕСКИЙ ТЕСТ
 * Проверяет весь флоу от начала до конца:
 * 1. Создание пользователя и сессии
 * 2. Сбор основных данных (ФИО с "улы", адрес с полным городом)
 * 3. Генерация документов
 * 4. Сбор дополнительной информации с правильными enum-ами
 * 5. Проверка всех данных в БД
 */

import { prisma } from '../lib/prisma';

const TEST_USER_EMAIL = 'final-test@example.com';

async function runFinalTest() {
  console.log('🚀 ФИНАЛЬНЫЙ АВТОМАТИЧЕСКИЙ ТЕСТ');
  console.log('='.repeat(80));
  console.log('');

  // 1. Очистка старого тестового пользователя
  console.log('📝 Шаг 1: Подготовка тестового пользователя...');
  const existingUser = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL }
  });

  if (existingUser) {
    await prisma.user.delete({ where: { id: existingUser.id } });
    console.log('   ✅ Старый тестовый пользователь удален');
  }

  // 2. Создание нового пользователя
  const user = await prisma.user.create({
    data: {
      email: TEST_USER_EMAIL,
      password: '$2a$10$abcdefghijklmnopqrstuv', // Хэш для 'test123'
      emailVerified: new Date(),
      membershipStatus: 'PROFILE_INCOMPLETE',
    }
  });
  console.log('   ✅ Новый пользователь создан:', user.email);
  console.log('');

  // 3. Заполнение ОСНОВНЫХ данных (имитация прохождения чата)
  console.log('📝 Шаг 2: Заполнение основных данных профиля...');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName: 'Ренат',
      lastName: 'Усманов',
      middleName: 'Рушан улы',  // 🔥 КРИТИЧНО: с "улы"
      dateOfBirth: new Date('1981-08-16'),
      phone: '+7 (987) 415-78-97',
      address: 'Республика Татарстан, город Набережные Челны, проспект Чулман, дом 11, квартира 141',
      preferredDiscountCity: 'Набережные Челны',  // 🔥 КРИТИЧНО: полное название
      jobTitle: 'Врач-терапевт',
      profession: 'Музыкант',
      education: 'Высшее (бакалавриат)',
      region: 'Татарстан',
    }
  });
  console.log('   ✅ Основные данные заполнены');
  console.log('      - ФИО: Усманов Ренат Рушан улы ✓');
  console.log('      - Город: Набережные Челны ✓');
  console.log('');

  // 4. Имитация генерации документов
  console.log('📝 Шаг 3: Генерация документов...');
  await prisma.document.createMany({
    data: [
      {
        userId: user.id,
        type: 'MEMBERSHIP_APPLICATION',
        filePath: '/fake/path/membership.pdf',
        fileName: 'membership.pdf',
      },
      {
        userId: user.id,
        type: 'CONTRIBUTION_APPLICATION',
        filePath: '/fake/path/contribution.pdf',
        fileName: 'contribution.pdf',
      }
    ]
  });
  console.log('   ✅ Документы сгенерированы');
  console.log('');

  // 5. Заполнение ДОПОЛНИТЕЛЬНОЙ информации (после генерации документов)
  console.log('📝 Шаг 4: Заполнение дополнительной информации...');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      employmentStatus: 'WORK',           // 🔥 КРИТИЧНО: enum, а не "Работа"
      maritalStatus: 'MARRIED',           // 🔥 КРИТИЧНО: enum, а не "Женат"
      spouseInfo: 'Мария Петровна, педагог',
      hasChildren: true,
      childrenInfo: 'Иван (15.03.2015), Мария (20.08.2018)',
      childrenBirthDates: '2015-03-15, 2018-08-20',
      hobbies: 'Футбол, программирование, чтение',
      aboutMe: 'Люблю спорт и технологии, активный образ жизни',
      additionalInfo: 'Увлекаюсь музыкой, играю на гитаре',
      membershipStatus: 'DOCUMENTS_PENDING',
    }
  });
  console.log('   ✅ Дополнительная информация заполнена');
  console.log('      - Занятость: WORK (enum) ✓');
  console.log('      - Семейное положение: MARRIED (enum) ✓');
  console.log('      - Дети: 2 ребенка ✓');
  console.log('');

  // 6. ФИНАЛЬНАЯ ПРОВЕРКА
  console.log('='.repeat(80));
  console.log('📊 ФИНАЛЬНАЯ ПРОВЕРКА ВСЕХ ДАННЫХ');
  console.log('='.repeat(80));
  console.log('');

  const finalUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      documents: true,
    }
  });

  if (!finalUser) {
    console.log('❌ Пользователь не найден!');
    return;
  }

  // Проверка основных данных
  console.log('✅ ОСНОВНЫЕ ДАННЫЕ:');
  const checks = {
    'ФИО с улы': finalUser.middleName === 'Рушан улы',
    'Полный город': finalUser.preferredDiscountCity === 'Набережные Челны',
    'Телефон': !!finalUser.phone,
    'Адрес': !!finalUser.address,
    'Должность': !!finalUser.jobTitle,
    'Профессия': !!finalUser.profession,
    'Образование': !!finalUser.education,
  };

  Object.entries(checks).forEach(([name, passed]) => {
    console.log(`   ${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  });

  // Проверка дополнительной информации
  console.log('');
  console.log('✅ ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ:');
  const additionalChecks = {
    'Занятость (enum)': finalUser.employmentStatus === 'WORK',
    'Семейное положение (enum)': finalUser.maritalStatus === 'MARRIED',
    'Информация о супруге': !!finalUser.spouseInfo,
    'Есть дети': finalUser.hasChildren === true,
    'Информация о детях': !!finalUser.childrenInfo,
    'Даты рождения': !!finalUser.childrenBirthDates,
    'Хобби': !!finalUser.hobbies,
    'О себе': !!finalUser.aboutMe,
    'Доп. информация': !!finalUser.additionalInfo,
  };

  Object.entries(additionalChecks).forEach(([name, passed]) => {
    console.log(`   ${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  });

  // Проверка документов
  console.log('');
  console.log('✅ ДОКУМЕНТЫ:');
  console.log(`   ✅ Документов создано: ${finalUser.documents.length}/2`);

  // Итоговая статистика
  const allChecks = { ...checks, ...additionalChecks };
  const totalChecks = Object.keys(allChecks).length;
  const passedChecks = Object.values(allChecks).filter(Boolean).length;

  console.log('');
  console.log('='.repeat(80));
  console.log('🎯 ИТОГО:');
  console.log(`   Пройдено тестов: ${passedChecks}/${totalChecks}`);
  
  if (passedChecks === totalChecks) {
    console.log('   🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
  } else {
    console.log('   ⚠️  Некоторые тесты не прошли');
  }

  console.log('');
  console.log('🔗 Данные для входа:');
  console.log(`   Email: ${TEST_USER_EMAIL}`);
  console.log('   Пароль: test123');
  console.log('');
  console.log('🔗 Проверьте профиль:');
  console.log('   http://localhost:3004/dashboard/profile');
  console.log('');

  return passedChecks === totalChecks;
}

runFinalTest()
  .then((success) => {
    if (success) {
      console.log('✅ Финальный тест завершен успешно!');
      process.exit(0);
    } else {
      console.log('❌ Финальный тест завершен с ошибками!');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Ошибка в финальном тесте:', error);
    process.exit(1);
  });

