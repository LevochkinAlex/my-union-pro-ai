import { PrismaClient } from '@prisma/client';
import { extractProfileDataFromMessages } from '../lib/profile-extraction';

const prisma = new PrismaClient();

const TEST_USER_EMAIL = '9061109990@mail.ru';

async function testExtractionViaAPI() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 ТЕСТ ЭКСТРАКТА ЧЕРЕЗ API');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. Получаем пользователя
    const user = await prisma.user.findUnique({
      where: { email: TEST_USER_EMAIL },
      select: { id: true, email: true },
    });

    if (!user) {
      console.error(`❌ Пользователь ${TEST_USER_EMAIL} не найден`);
      return;
    }

    console.log(`✅ Пользователь найден: ${user.email} (ID: ${user.id})\n`);

    // 2. Создаем новую сессию
    const chatSession = await prisma.chatSession.create({
      data: {
        userId: user.id,
        title: 'Тест экстракта',
        type: 'STATEMENT',
      },
    });

    console.log(`✅ Создана сессия: ${chatSession.id}\n`);

    // 3. Получаем бота
    const bot = await prisma.chatBot.findFirst({
      where: { isDefault: true },
    });

    if (!bot) {
      console.error('❌ Бот не найден');
      return;
    }

    console.log(`✅ Бот найден: ${bot.name}\n`);

    // 4. Создаем приветственное сообщение
    const welcomeMessage = await prisma.chatMessage.create({
      data: {
        content: 'Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого.\n\nВы можете заполнить профиль вместе со мной в чате, или самостоятельно через удобную форму.\n\nДавайте начнем. Укажите регион России, в которой вы находитесь.[SHOW_SELF_FILL_BUTTON]',
        role: 'assistant',
        userId: user.id,
        sessionId: chatSession.id,
        chatBotId: bot.id,
      },
    });

    console.log('✅ Создано приветственное сообщение\n');

    // 5. Симулируем диалог
    const dialog = [
      { role: 'user' as const, content: 'Татарстан' },
      { role: 'assistant' as const, content: 'Отлично! Вы указали регион: Татарстан. Теперь укажите, пожалуйста, название вашей организации (место работы).' },
      { role: 'user' as const, content: 'Государственное АУ Здравоохранения Республики Татарстан Больница Скорой Медицинской Помощи имени Р.С. Акчурина' },
      { role: 'assistant' as const, content: 'Я нашел вашу организацию в реестре:\n\n**Государственное АУ Здравоохранения Республики Татарстан Больница Скорой Медицинской Помощи имени Р.С. Акчурина.**\n\nЭто правильная организация? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, ваше полное ФИО (Фамилия Имя Отчество).' },
      { role: 'user' as const, content: 'Усманов Ренат Рушан улы' },
      { role: 'assistant' as const, content: 'Ваше ФИО: Усманов Ренат Рушан улы. Верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, вашу дату рождения (формат: ДД.ММ.ГГГГ).' },
      { role: 'user' as const, content: '16.01.1981' },
      { role: 'assistant' as const, content: 'Ваша дата рождения: 16.01.1981. Верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, ваш адрес проживания (город, улица, дом).' },
      { role: 'user' as const, content: 'Респ Татарстан, г Набережные Челны, пр-кт Чулман, д. 11' },
      { role: 'assistant' as const, content: 'Это правильный адрес: Респ Татарстан, г Набережные Челны, пр-кт Чулман, д. 11? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, ваш номер телефона (формат: +7 (XXX) XXX-XX-XX).' },
      { role: 'user' as const, content: '+7 (987) 415-78-97' },
      { role: 'assistant' as const, content: 'Ваш телефон: +7 (987) 415-78-97. Верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, вашу должность.' },
      { role: 'user' as const, content: 'врач-хирург' },
      { role: 'assistant' as const, content: 'Ваша должность: врач-хирург. Верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, вашу профессию.' },
      { role: 'user' as const, content: 'хирург' },
      { role: 'assistant' as const, content: 'Ваша профессия: врач-хирург. Верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Теперь, пожалуйста, напишите ваш уровень образования. Вот доступные варианты для справки: Высшее, Среднее профессиональное, Среднее общее, Неполное высшее, Аспирантура, Магистратура, Бакалавриат.' },
      { role: 'user' as const, content: 'Высшее (магистратура)' },
      { role: 'assistant' as const, content: 'Ваше образование: Высшее (магистратура). Верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Давайте проверим собранные данные:\n\n1. **Регион**: Татарстан\n2. **Организация**: Государственное АУ Здравоохранения Республики Татарстан Больница Скорой Медицинской Помощи имени Р.С. Акчурина\n3. **ФИО**: Усманов Ренат Рушан улы\n4. **Дата рождения**: 16.01.1981\n5. **Адрес**: Респ Татарстан, г Набережные Челны, пр-кт Чулман, д. 11\n6. **Телефон**: +7 (987) 415-78-97\n7. **Должность**: врач-хирург\n8. **Профессия**: врач-хирург\n9. **Образование**: Высшее (магистратура)\n\nВсе верно? (да/нет)' },
      { role: 'user' as const, content: 'да' },
      { role: 'assistant' as const, content: 'Отлично! Генерирую для вас заявления...\n\n[PROFILE_COMPLETE]' },
      { role: 'assistant' as const, content: 'Отлично! Ваши документы готовы. Теперь давайте узнаем о вас немного больше для более персонализированного общения. Расскажите, пожалуйста, о себе.' },
      { role: 'user' as const, content: 'Я работаю врачом-хирургом уже 10 лет' },
      { role: 'assistant' as const, content: 'Спасибо! Теперь укажите, пожалуйста, вашу занятость. Вы работаете, учитесь или на пенсии?' },
      { role: 'user' as const, content: 'Работаю' },
      { role: 'assistant' as const, content: 'Отлично! Теперь укажите, пожалуйста, ваше семейное положение (женат/замужем, холост/не замужем, в разводе, вдовец/вдова, гражданский брак).' },
      { role: 'user' as const, content: 'Женат' },
      { role: 'assistant' as const, content: 'Отлично! Расскажите, пожалуйста, о вашем супруге (имя, чем занимается).' },
      { role: 'user' as const, content: 'Елена, она работает учителем' },
      { role: 'assistant' as const, content: 'Спасибо за информацию! Ваш супруг зовут Елена, она работает учителем. Теперь, есть ли у вас дети?' },
      { role: 'user' as const, content: 'Да, двое' },
      { role: 'assistant' as const, content: 'Отлично! Сколько у вас детей? Укажите, пожалуйста, имя и дату рождения первого ребенка (формат: Имя, ДД.ММ.ГГГГ).' },
      { role: 'user' as const, content: 'Александр, 15.05.2010' },
      { role: 'assistant' as const, content: 'Отлично! А второго ребенка? (имя и дата рождения)' },
      { role: 'user' as const, content: 'Мария, 20.08.2015' },
      { role: 'assistant' as const, content: 'Спасибо! Теперь расскажите, пожалуйста, о ваших хобби и увлечениях.' },
      { role: 'user' as const, content: 'Люблю читать книги и играть в футбол' },
      { role: 'assistant' as const, content: 'Отлично! Есть ли что-то еще, что вы хотели бы рассказать о себе?' },
      { role: 'user' as const, content: 'Активно участвую в профсоюзной деятельности' },
    ];

    console.log('📝 Симулирую диалог...\n');

    // Создаем сообщения
    const messages = [welcomeMessage];
    for (const msg of dialog) {
      const created = await prisma.chatMessage.create({
        data: {
          content: msg.content,
          role: msg.role,
          userId: user.id,
          sessionId: chatSession.id,
          chatBotId: msg.role === 'assistant' ? bot.id : null,
        },
      });
      messages.push(created);
      console.log(`  ${msg.role === 'user' ? '👤' : '🤖'} ${msg.content.substring(0, 60)}...`);
    }

    console.log(`\n✅ Создано ${messages.length} сообщений\n`);

    // 6. Тестируем экстракт
    console.log('🔍 Тестирую экстракт данных...\n');

    const extractedData = await extractProfileDataFromMessages(
      messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))
    );

    console.log('📊 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Регион:', extractedData.region || '❌');
    console.log('  Организация:', extractedData.organizationName || '❌');
    console.log('  Фамилия:', extractedData.lastName || '❌');
    console.log('  Имя:', extractedData.firstName || '❌');
    console.log('  Отчество:', extractedData.middleName || '❌');
    console.log('  Дата рождения:', extractedData.dateOfBirth ? new Date(extractedData.dateOfBirth).toLocaleDateString('ru-RU') : '❌');
    console.log('  Адрес:', extractedData.address || '❌');
    console.log('  Телефон:', extractedData.phone || '❌');
    console.log('  Должность:', extractedData.jobTitle || '❌');
    console.log('  Профессия:', extractedData.profession || '❌');
    console.log('  Образование:', extractedData.education || '❌');
    console.log('  Город для скидок:', extractedData.preferredDiscountCity || '❌');
    console.log('\n📋 ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ:');
    console.log('  Занятость:', extractedData.employmentStatus || '❌');
    console.log('  Семейное положение:', extractedData.maritalStatus || '❌');
    console.log('  Информация о супруге:', extractedData.spouseInfo || '❌');
    console.log('  Есть дети:', extractedData.hasChildren !== undefined ? (extractedData.hasChildren ? 'Да' : 'Нет') : '❌');
    console.log('  Дети:', extractedData.childrenBirthDates ? JSON.stringify(extractedData.childrenBirthDates) : '❌');
    console.log('  Хобби:', extractedData.hobbies || '❌');
    console.log('  О себе:', extractedData.aboutMe || '❌');
    console.log('  Доп. информация:', extractedData.additionalInfo || '❌');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 7. Проверяем полноту данных
    const requiredFields = [
      'region',
      'organizationName',
      'lastName',
      'firstName',
      'dateOfBirth',
      'address',
      'phone',
      'jobTitle',
      'profession',
      'education',
    ];

    const missingFields = requiredFields.filter((field) => !extractedData[field]);
    const hasAllFields = missingFields.length === 0;

    if (hasAllFields) {
      console.log('✅ Все обязательные поля извлечены!');
    } else {
      console.log(`⚠️ Отсутствуют поля: ${missingFields.join(', ')}`);
    }

    // 8. Обновляем профиль пользователя
    console.log('\n🔄 Обновляю профиль пользователя...\n');

    const updateData: any = {};
    if (extractedData.region) updateData.region = extractedData.region;
    if (extractedData.organizationName) updateData.organizationName = extractedData.organizationName;
    if (extractedData.lastName) updateData.lastName = extractedData.lastName;
    if (extractedData.firstName) updateData.firstName = extractedData.firstName;
    if (extractedData.middleName) updateData.middleName = extractedData.middleName;
    if (extractedData.dateOfBirth) updateData.dateOfBirth = new Date(extractedData.dateOfBirth);
    if (extractedData.address) updateData.address = extractedData.address;
    if (extractedData.phone) updateData.phone = extractedData.phone;
    if (extractedData.jobTitle) updateData.jobTitle = extractedData.jobTitle;
    if (extractedData.profession) updateData.profession = extractedData.profession;
    if (extractedData.education) updateData.education = extractedData.education;
    if (extractedData.preferredDiscountCity) updateData.preferredDiscountCity = extractedData.preferredDiscountCity;
    if (extractedData.employmentStatus) updateData.employmentStatus = extractedData.employmentStatus;
    if (extractedData.maritalStatus) updateData.maritalStatus = extractedData.maritalStatus;
    if (extractedData.spouseInfo) updateData.spouseInfo = extractedData.spouseInfo;
    if (extractedData.hasChildren !== undefined) updateData.hasChildren = extractedData.hasChildren;
    if (extractedData.childrenBirthDates) updateData.childrenBirthDates = extractedData.childrenBirthDates;
    if (extractedData.hobbies) updateData.hobbies = extractedData.hobbies;
    if (extractedData.aboutMe) updateData.aboutMe = extractedData.aboutMe;
    if (extractedData.additionalInfo) updateData.additionalInfo = extractedData.additionalInfo;

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    console.log('✅ Профиль обновлен\n');

    // 9. Проверяем обновленный профиль
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        region: true,
        organizationName: true,
        lastName: true,
        firstName: true,
        middleName: true,
        dateOfBirth: true,
        address: true,
        phone: true,
        jobTitle: true,
        profession: true,
        education: true,
        preferredDiscountCity: true,
        employmentStatus: true,
        maritalStatus: true,
        spouseInfo: true,
        hasChildren: true,
        childrenBirthDates: true,
        hobbies: true,
        aboutMe: true,
        additionalInfo: true,
      },
    });

    console.log('📋 ПРОФИЛЬ В БАЗЕ ДАННЫХ:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Регион:', updatedUser?.region || '❌');
    console.log('  Организация:', updatedUser?.organizationName || '❌');
    console.log('  ФИО:', `${updatedUser?.lastName || ''} ${updatedUser?.firstName || ''} ${updatedUser?.middleName || ''}`.trim() || '❌');
    console.log('  Дата рождения:', updatedUser?.dateOfBirth ? updatedUser.dateOfBirth.toLocaleDateString('ru-RU') : '❌');
    console.log('  Адрес:', updatedUser?.address || '❌');
    console.log('  Телефон:', updatedUser?.phone || '❌');
    console.log('  Должность:', updatedUser?.jobTitle || '❌');
    console.log('  Профессия:', updatedUser?.profession || '❌');
    console.log('  Образование:', updatedUser?.education || '❌');
    console.log('  Город для скидок:', updatedUser?.preferredDiscountCity || '❌');
    console.log('\n📋 ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ В БАЗЕ:');
    console.log('  Занятость:', updatedUser?.employmentStatus || '❌');
    console.log('  Семейное положение:', updatedUser?.maritalStatus || '❌');
    console.log('  Информация о супруге:', updatedUser?.spouseInfo || '❌');
    console.log('  Есть дети:', updatedUser?.hasChildren !== undefined ? (updatedUser.hasChildren ? 'Да' : 'Нет') : '❌');
    console.log('  Дети:', updatedUser?.childrenBirthDates ? JSON.stringify(updatedUser.childrenBirthDates) : '❌');
    console.log('  Хобби:', updatedUser?.hobbies || '❌');
    console.log('  О себе:', updatedUser?.aboutMe || '❌');
    console.log('  Доп. информация:', updatedUser?.additionalInfo || '❌');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('✅✅✅ ТЕСТ ЗАВЕРШЕН ✅✅✅\n');
    console.log(`💡 Сессия: ${chatSession.id}`);
    console.log(`   URL: http://localhost:3004/dashboard?session=${chatSession.id}\n`);

  } catch (error) {
    console.error('\n❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testExtractionViaAPI();

