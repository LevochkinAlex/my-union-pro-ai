import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function testBBActivation(email, testDiscountId = 1916) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 Тестирование активации для: ${email}`);
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
      console.log(`❌ Пользователь не найден`);
      return false;
    }

    console.log(`\n👤 Пользователь: ${user.firstName} ${user.lastName}`);
    console.log(`   bestBenefitsUserId: ${user.bestBenefitsUserId}`);
    console.log(`   bestBenefitsPassword: ${user.bestBenefitsPassword ? "✅" : "❌"}`);

    if (!user.bestBenefitsUserId || !user.bestBenefitsPassword) {
      console.log(`\n❌ Пользователь не готов к активации`);
      return false;
    }

    // Импортируем функции
    const { decryptPassword } = await import("../lib/best-benefits-password.ts");
    const { safeActivateDiscount } = await import("../lib/best-benefits-activation.ts");

    let decryptedPassword;
    try {
      decryptedPassword = decryptPassword(user.bestBenefitsPassword);
      console.log(`\n🔓 Пароль расшифрован`);
    } catch (error) {
      console.error(`❌ Ошибка расшифровки:`, error);
      return false;
    }

    console.log(`\n🚀 Пробуем активировать скидку ${testDiscountId}...`);
    
    const result = await safeActivateDiscount({
      userId: user.id,
      bestBenefitsUserId: user.bestBenefitsUserId,
      discountId: testDiscountId,
      email: user.email,
      password: decryptedPassword,
    });

    console.log(`\n📊 Результат активации:`);
    console.log(`   Успех: ${result.success ? "✅" : "❌"}`);
    console.log(`   Промокод: ${result.promoCode || "НЕТ"}`);

    if (result.success) {
      console.log(`\n✅ АКТИВАЦИЯ УСПЕШНА!`);
      console.log(`   Пользователь может активировать скидки`);
      console.log(`   Пароль в BestBenefits корректный`);
      return true;
    } else {
      console.log(`\n❌ АКТИВАЦИЯ НЕ УДАЛАСЬ`);
      console.log(`   Возможно проблема с паролем или аккаунтом в BB`);
      return false;
    }

  } catch (error) {
    console.error(`\n❌ Ошибка тестирования:`, error);
    return false;
  }
}

async function main() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`🧪 ТЕСТИРОВАНИЕ АКТИВАЦИИ СКИДОК В BESTBENEFITS`);
  console.log("=".repeat(80));
  console.log(`\nПроверяем, могут ли пользователи активировать скидки с текущими паролями\n`);

  const emails = ["9061109990@mail.ru", "talik.e@mail.ru"];
  const results = [];

  for (const email of emails) {
    const success = await testBBActivation(email);
    results.push({ email, success });
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 ИТОГОВЫЙ ОТЧЕТ`);
  console.log("=".repeat(80));
  
  results.forEach(({ email, success }) => {
    console.log(`  ${success ? "✅" : "❌"} ${email}`);
  });

  const successCount = results.filter(r => r.success).length;
  
  if (successCount === results.length) {
    console.log(`\n✅ ВСЕ ПОЛЬЗОВАТЕЛИ МОГУТ АКТИВИРОВАТЬ СКИДКИ!`);
    console.log(`   Пароли в BestBenefits корректны`);
    console.log(`   Пересоздавать пользователей НЕ нужно`);
  } else if (successCount > 0) {
    console.log(`\n⚠️  ЧАСТИЧНЫЙ УСПЕХ: ${successCount}/${results.length}`);
    console.log(`   Некоторые пользователи могут активировать, другие - нет`);
  } else {
    console.log(`\n❌ ПОЛЬЗОВАТЕЛИ НЕ МОГУТ АКТИВИРОВАТЬ СКИДКИ`);
    console.log(`   Нужно удалить их из BB и пересоздать с новыми паролями`);
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

