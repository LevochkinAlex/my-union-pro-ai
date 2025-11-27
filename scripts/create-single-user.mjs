import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function createUserInBB(email) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔄 Создание пользователя в BestBenefits: ${email}`);
  console.log("=".repeat(80));

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.log(`❌ Пользователь ${email} не найден в локальной БД`);
      return false;
    }

    console.log(`\n👤 Данные пользователя:`);
    console.log(`   Имя: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   bestBenefitsPassword: ${user.bestBenefitsPassword ? "✅ ЕСТЬ" : "❌ НЕТ"}`);

    if (!user.bestBenefitsPassword) {
      console.log(`\n❌ У пользователя нет зашифрованного пароля`);
      return false;
    }

    // Импортируем функции
    const { decryptPassword } = await import("../lib/best-benefits-password.ts");
    const { createBestBenefitsUser } = await import("../lib/best-benefits-users.ts");

    // Расшифровываем пароль
    let decryptedPassword;
    try {
      decryptedPassword = decryptPassword(user.bestBenefitsPassword);
      console.log(`\n🔓 Пароль успешно расшифрован`);
      console.log(`   Длина пароля: ${decryptedPassword.length} символов`);
    } catch (error) {
      console.error(`❌ Ошибка расшифровки пароля:`, error);
      return false;
    }

    // Формируем имя
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];
    
    console.log(`\n🚀 Попытка создания пользователя в BestBenefits...`);
    console.log(`   Имя: ${name}`);
    console.log(`   Email: ${user.email}`);

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: decryptedPassword,
        city_id: null,
      });

      console.log(`\n✅✅✅ УСПЕХ! Пользователь создан в BestBenefits!`);
      console.log(`   Статус: ${result.status}`);
      console.log(`   Сообщение: ${result.message || "OK"}`);
      console.log(`   Полный ответ:`, JSON.stringify(result, null, 2));

      // Обновляем bestBenefitsUserId в локальной БД
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: user.email,
        },
      });

      console.log(`\n✅ Локальная БД обновлена`);
      console.log(`   bestBenefitsUserId: ${user.email}`);

      // Тестируем авторизацию
      console.log(`\n🧪 Проверяем авторизацию...`);
      const { getUserBestBenefitsToken } = await import("../lib/best-benefits-user-auth.ts");
      
      try {
        const token = await getUserBestBenefitsToken(user.email, decryptedPassword);
        console.log(`✅ Авторизация успешна!`);
        console.log(`   Токен получен (первые 20 символов): ${token.substring(0, 20)}...`);
      } catch (authError) {
        console.error(`⚠️  Авторизация не удалась:`, authError.message);
        console.log(`   Но пользователь создан, возможно нужно время для активации`);
      }

      return true;
    } catch (error) {
      console.error(`\n❌ Ошибка создания пользователя:`, error.message);
      
      if (error.message && error.message.includes("already exists")) {
        console.log(`\n⚠️  Пользователь уже существует в BestBenefits`);
        console.log(`   Но в системе BB говорят что его нет - возможно проблема с кешем`);
        console.log(`   Попробуйте:`);
        console.log(`   1. Подождать 5-10 минут`);
        console.log(`   2. Обратиться в поддержку BestBenefits`);
        console.log(`   3. Попробовать удалить через другой интерфейс`);
      }
      
      return false;
    }
  } catch (error) {
    console.error(`❌ Критическая ошибка:`, error);
    return false;
  }
}

async function main() {
  const email = process.argv[2] || "9061109990@mail.ru";
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🚀 СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ В BESTBENEFITS`);
  console.log("=".repeat(80));
  console.log(`\nEmail: ${email}\n`);

  const success = await createUserInBB(email);

  console.log(`\n${"=".repeat(80)}`);
  if (success) {
    console.log(`✅ ГОТОВО!`);
    console.log(`   Пользователь ${email} создан и готов к работе`);
  } else {
    console.log(`❌ НЕ УДАЛОСЬ СОЗДАТЬ ПОЛЬЗОВАТЕЛЯ`);
    console.log(`   Проверьте ошибки выше`);
  }
  console.log("=".repeat(80));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


