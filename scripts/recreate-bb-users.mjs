import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function recreateUserInBB(email) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔄 Пересоздание пользователя в BestBenefits: ${email}`);
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
    console.log(`   bestBenefitsUserId (текущий): ${user.bestBenefitsUserId || "НЕТ"}`);
    console.log(`   bestBenefitsPassword: ${user.bestBenefitsPassword ? "✅ ЕСТЬ" : "❌ НЕТ"}`);

    if (!user.bestBenefitsPassword) {
      console.log(`\n❌ У пользователя нет зашифрованного пароля`);
      console.log(`   Невозможно создать пользователя без пароля`);
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
    } catch (error) {
      console.error(`❌ Ошибка расшифровки пароля:`, error);
      return false;
    }

    // Формируем имя
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];
    
    console.log(`\n🚀 Создание пользователя в BestBenefits...`);
    console.log(`   Имя: ${name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Пароль: ****** (зашифрован)`);

    try {
      const result = await createBestBenefitsUser({
        name,
        email: user.email,
        password: decryptedPassword,
        city_id: null,
      });

      console.log(`\n✅ Пользователь успешно создан в BestBenefits!`);
      console.log(`   Статус: ${result.status}`);
      console.log(`   Сообщение: ${result.message || "OK"}`);

      // Обновляем bestBenefitsUserId в локальной БД
      await prisma.user.update({
        where: { id: user.id },
        data: {
          bestBenefitsUserId: user.email, // Используем email как ID
        },
      });

      console.log(`\n✅ Локальная БД обновлена`);
      console.log(`   bestBenefitsUserId: ${user.email}`);

      return true;
    } catch (error) {
      console.error(`\n❌ Ошибка создания пользователя в BestBenefits:`, error);
      
      // Проверяем, может быть пользователь уже существует
      if (error.message && error.message.includes("already exists")) {
        console.log(`\n⚠️  Пользователь уже существует в BestBenefits`);
        console.log(`   Возможно, он не был удален или был создан снова`);
        console.log(`   Обновляю локальную БД...`);
        
        await prisma.user.update({
          where: { id: user.id },
          data: {
            bestBenefitsUserId: user.email,
          },
        });
        
        console.log(`✅ bestBenefitsUserId установлен: ${user.email}`);
        return true;
      }
      
      return false;
    }
  } catch (error) {
    console.error(`❌ Критическая ошибка:`, error);
    return false;
  }
}

async function main() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🔄 ПЕРЕСОЗДАНИЕ ПОЛЬЗОВАТЕЛЕЙ В BESTBENEFITS`);
  console.log("=".repeat(80));
  console.log(`\n⚠️  ВАЖНО: Убедитесь, что пользователи удалены из BestBenefits!`);
  console.log(`   Если они не удалены, получите ошибку "already exists"\n`);

  const emails = ["9061109990@mail.ru", "talik.e@mail.ru"];
  const results = [];

  for (const email of emails) {
    const success = await recreateUserInBB(email);
    results.push({ email, success });
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 ИТОГОВЫЙ ОТЧЕТ`);
  console.log("=".repeat(80));
  
  results.forEach(({ email, success }) => {
    console.log(`  ${success ? "✅" : "❌"} ${email}`);
  });

  const successCount = results.filter(r => r.success).length;
  console.log(`\n${successCount === results.length ? "✅" : "⚠️"} Создано: ${successCount}/${results.length}`);
  
  if (successCount === results.length) {
    console.log(`\n💡 Теперь пользователи могут:`);
    console.log(`   1. Войти на https://bestbenefits.ru со своими учетными данными`);
    console.log(`   2. Активировать скидки через MyUnion и получать промокоды`);
    console.log(`   3. Синхронизировать свои активации между платформами`);
  } else {
    console.log(`\n⚠️  Некоторые пользователи не были созданы`);
    console.log(`   Проверьте ошибки выше и повторите попытку`);
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

