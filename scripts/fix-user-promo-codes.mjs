import { PrismaClient } from "@prisma/client";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getUserActivatedDiscounts } from "../lib/best-benefits-activation.js";
import { decryptPassword } from "../lib/best-benefits-password.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

async function fixUserPromoCodes(email) {
  try {
    console.log(`\n🔍 Исправление промокодов для пользователя ${email}...\n`);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        bestBenefitsUserId: true,
        bestBenefitsPassword: true,
      },
    });

    if (!user) {
      console.log(`❌ Пользователь ${email} не найден`);
      return;
    }

    console.log(`✅ Пользователь найден:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   BestBenefits User ID: ${user.bestBenefitsUserId || "❌ НЕ УСТАНОВЛЕН"}`);
    console.log(`   BestBenefits Password: ${user.bestBenefitsPassword ? "✅ ЕСТЬ" : "❌ НЕТ"}\n`);

    if (!user.bestBenefitsUserId) {
      console.log(`❌ Пользователь не синхронизирован с BestBenefits`);
      console.log(`   Запустите: node scripts/sync-user-to-bb.mjs ${email}`);
      return;
    }

    // Получаем preferences
    const preference = await prisma.discountPreference.findUnique({
      where: { userId: user.id },
    });

    if (!preference) {
      console.log(`❌ Preferences не найдены`);
      return;
    }

    const filters = preference.filters || {};
    const claimed = filters.claimed || [];
    
    console.log(`📋 Текущие claimed (${claimed.length}):`);
    claimed.forEach((item, idx) => {
      if (typeof item === 'object') {
        console.log(`   ${idx + 1}. ID: ${item.id}, PromoCode: ${item.promoCode || "❌ НЕТ"}`);
      } else {
        console.log(`   ${idx + 1}. ID: ${item} (число, без промокода)`);
      }
    });

    // Декодируем пароль
    let userPassword = undefined;
    if (user.bestBenefitsPassword) {
      try {
        userPassword = decryptPassword(user.bestBenefitsPassword);
        console.log(`\n🔑 Пароль расшифрован\n`);
      } catch (error) {
        console.error(`❌ Ошибка расшифровки пароля:`, error);
        return;
      }
    }

    // Получаем активированные скидки с BestBenefits
    console.log(`🔄 Загрузка активированных скидок с BestBenefits...\n`);
    const bbActivated = await getUserActivatedDiscounts(user.bestBenefitsUserId, userPassword);

    if (bbActivated.length === 0) {
      console.log(`⚠️  На BestBenefits нет активированных скидок`);
      console.log(`   Возможно, скидки были активированы только локально\n`);
    } else {
      console.log(`✅ Найдено ${bbActivated.length} активированных скидок на BestBenefits:\n`);
      bbActivated.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ID: ${item.id}, PromoCode: ${item.promoCode || "❌ НЕТ"}`);
      });
    }

    // Создаем Map для быстрого поиска промокодов из BestBenefits
    const bbPromoCodesMap = new Map();
    bbActivated.forEach(item => {
      if (item.promoCode) {
        bbPromoCodesMap.set(item.id, item.promoCode);
      }
    });

    // Обновляем claimed с промокодами
    const updatedClaimed = claimed.map((item) => {
      const itemId = typeof item === 'object' ? item.id : item;
      
      // Если уже есть промокод, оставляем его
      if (typeof item === 'object' && item.promoCode) {
        return item;
      }
      
      // Ищем промокод в BestBenefits
      const bbPromoCode = bbPromoCodesMap.get(itemId);
      if (bbPromoCode) {
        console.log(`   ✅ Найден промокод для ID ${itemId}: ${bbPromoCode}`);
        return { id: itemId, promoCode: bbPromoCode };
      }
      
      // Если промокода нет, сохраняем как объект без промокода
      return { id: itemId, promoCode: null };
    });

    // Сохраняем обновленные preferences
    await prisma.discountPreference.update({
      where: { userId: user.id },
      data: {
        filters: {
          ...(filters || {}),
          claimed: updatedClaimed,
        },
      },
    });

    console.log(`\n✨ Preferences обновлены!`);
    console.log(`   Обновлено ${updatedClaimed.length} записей\n`);

    // Показываем итоговый результат
    console.log(`📋 Итоговые claimed:`);
    updatedClaimed.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ID: ${item.id}, PromoCode: ${item.promoCode || "❌ НЕТ"}`);
    });

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error);
    if (error.stack) {
      console.error(`Stack:`, error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2] || "talik.e@mail.ru";
fixUserPromoCodes(email);

