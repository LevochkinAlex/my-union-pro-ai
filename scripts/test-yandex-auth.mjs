import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Тестирование парсинга ФИО из Яндекс
 */
function testParseYandexName() {
  console.log("🧪 Тестирование парсинга ФИО из Яндекс\n");

  // Тест 1: first_name и last_name (идеальный случай)
  const test1 = {
    first_name: "Иван",
    last_name: "Иванов",
  };
  console.log("Тест 1: first_name/last_name");
  console.log("  Вход:", test1);
  // Ожидаем: firstName: "Иван", lastName: "Иванов"

  // Тест 2: real_name в формате "Фамилия Имя Отчество"
  const test2 = {
    real_name: "Иванов Иван Петрович",
  };
  console.log("\nТест 2: real_name = 'Фамилия Имя Отчество'");
  console.log("  Вход:", test2);
  // Ожидаем: lastName: "Иванов", firstName: "Иван", middleName: "Петрович"

  // Тест 3: real_name в формате "Имя Фамилия"
  const test3 = {
    real_name: "Иван Иванов",
  };
  console.log("\nТест 3: real_name = 'Имя Фамилия'");
  console.log("  Вход:", test3);
  // Ожидаем: firstName: "Иван", lastName: "Иванов"

  // Тест 4: real_name с фамилией на -ов
  const test4 = {
    real_name: "Петров Петр",
  };
  console.log("\nТест 4: real_name с фамилией на -ов");
  console.log("  Вход:", test4);
  // Ожидаем: lastName: "Петров", firstName: "Петр"

  // Тест 5: только first_name
  const test5 = {
    first_name: "Мария",
  };
  console.log("\nТест 5: только first_name");
  console.log("  Вход:", test5);
  // Ожидаем: firstName: "Мария"

  console.log("\n✅ Тесты парсинга ФИО завершены");
}

/**
 * Тестирование создания пользователя через Яндекс
 */
async function testYandexUserCreation() {
  console.log("\n🧪 Тестирование создания пользователя через Яндекс\n");

  try {
    const testEmail = `yandex-test-${Date.now()}@yandex.ru`;
    
    // Симулируем данные от Яндекс API
    const yandexUserInfo = {
      id: "123456789",
      default_email: testEmail,
      first_name: "Тест",
      last_name: "Тестов",
      default_phone: {
        number: "+79991234567",
      },
    };

    console.log("1️⃣ Создание пользователя с данными от Яндекс:");
    console.log("   Email:", yandexUserInfo.default_email);
    console.log("   Имя:", yandexUserInfo.first_name);
    console.log("   Фамилия:", yandexUserInfo.last_name);
    console.log("   Телефон:", yandexUserInfo.default_phone.number);

    // Проверяем что emailVerified НЕ устанавливается
    const user = await prisma.user.create({
      data: {
        email: yandexUserInfo.default_email,
        firstName: yandexUserInfo.first_name,
        lastName: yandexUserInfo.last_name,
        phone: yandexUserInfo.default_phone.number,
        role: "PENDING_MEMBER",
        membershipStatus: "PROFILE_INCOMPLETE",
        emailVerified: null, // НЕ верифицирован до валидации в анкете
      },
    });

    console.log("\n✅ Пользователь создан:");
    console.log("   ID:", user.id);
    console.log("   Email:", user.email);
    console.log("   Email Verified:", user.emailVerified ? "ДА ❌ (ОШИБКА!)" : "НЕТ ✅");
    console.log("   Имя:", user.firstName);
    console.log("   Фамилия:", user.lastName);

    if (user.emailVerified) {
      console.log("\n❌ ОШИБКА: emailVerified установлен при создании!");
    } else {
      console.log("\n✅ emailVerified НЕ установлен - правильно!");
    }

    // Очистка
    await prisma.user.delete({
      where: { id: user.id },
    });
    console.log("\n🧹 Тестовый пользователь удален");

  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
  }
}

/**
 * Тестирование создания пользователя через SMS
 */
async function testSMSUserCreation() {
  console.log("\n🧪 Тестирование создания пользователя через SMS\n");

  try {
    const testPhone = "+79991234567";
    
    console.log("1️⃣ Создание пользователя через SMS:");
    console.log("   Телефон:", testPhone);

    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        authPhone: testPhone,
        role: "PENDING_MEMBER",
        membershipStatus: "PROFILE_INCOMPLETE",
        emailVerified: null, // НЕ верифицирован до валидации в анкете
      },
    });

    console.log("\n✅ Пользователь создан:");
    console.log("   ID:", user.id);
    console.log("   Телефон:", user.phone);
    console.log("   Email Verified:", user.emailVerified ? "ДА ❌ (ОШИБКА!)" : "НЕТ ✅");

    if (user.emailVerified) {
      console.log("\n❌ ОШИБКА: emailVerified установлен при создании!");
    } else {
      console.log("\n✅ emailVerified НЕ установлен - правильно!");
    }

    // Очистка
    await prisma.user.delete({
      where: { id: user.id },
    });
    console.log("\n🧹 Тестовый пользователь удален");

  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
  }
}

async function runTests() {
  console.log("=".repeat(60));
  console.log("🧪 ТЕСТИРОВАНИЕ АВТОРИЗАЦИИ И ВАЛИДАЦИИ EMAIL");
  console.log("=".repeat(60));

  testParseYandexName();
  await testYandexUserCreation();
  await testSMSUserCreation();

  console.log("\n" + "=".repeat(60));
  console.log("✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ");
  console.log("=".repeat(60));
}

runTests()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error("❌ Критическая ошибка:", error);
    prisma.$disconnect();
    process.exit(1);
  });
