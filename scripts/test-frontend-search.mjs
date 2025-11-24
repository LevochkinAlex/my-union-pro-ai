#!/usr/bin/env node

/**
 * Тест поиска через наш API endpoint (как фронтенд)
 * Проверяет, правильно ли проходят данные через нашу систему
 */

// Чтобы использовать fetch в Node.js 18+
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

config({ path: join(rootDir, ".env.local") });
config({ path: join(rootDir, ".env") });

const API_BASE = "http://localhost:3000";

// Простой тест
async function testSearch(searchQuery, description) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔍 ${description}`);
  console.log(`Запрос: "${searchQuery}"`);
  console.log(`${"=".repeat(60)}`);
  
  const url = `${API_BASE}/api/discounts?search=${encodeURIComponent(searchQuery)}`;
  console.log(`📡 URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        Cookie: process.env.TEST_AUTH_COOKIE || "", // Нужна авторизация
      },
    });
    
    if (!response.ok) {
      console.error(`❌ Ошибка: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    const discounts = data?.discounts ?? [];
    
    console.log(`✅ Найдено: ${discounts.length} скидок`);
    console.log(`📊 Метаданные:`, {
      current_page: data.meta?.current_page,
      last_page: data.meta?.last_page,
      total: data.meta?.total,
      hasMore: data.meta?.hasMore,
    });
    
    if (discounts.length > 0) {
      console.log("\n📦 Первые 5 скидок:");
      discounts.slice(0, 5).forEach((d, i) => {
        console.log(`\n${i + 1}. [${d.id}] ${d.title}`);
        console.log(`   Категория: ${d.mainCategory?.name || "нет"}`);
        console.log(`   Скидка: ${d.discountValue || "нет"}`);
        console.log(`   Города: ${d.cities?.map(c => c.name).join(", ") || "нет"}`);
        if (d.promoCode) {
          console.log(`   Промокод: ${d.promoCode}`);
        }
      });
    } else {
      console.log("❌ Ничего не найдено");
    }
  } catch (error) {
    console.error(`❌ Ошибка:`, error.message);
  }
}

async function testAllDiscounts() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 Загрузка ВСЕХ скидок (первая страница)`);
  console.log(`${"=".repeat(60)}`);
  
  const url = `${API_BASE}/api/discounts?limit=100`;
  console.log(`📡 URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        Cookie: process.env.TEST_AUTH_COOKIE || "",
      },
    });
    
    if (!response.ok) {
      console.error(`❌ Ошибка: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    const discounts = data?.discounts ?? [];
    
    console.log(`✅ Загружено: ${discounts.length} скидок`);
    console.log(`📊 Метаданные:`, {
      current_page: data.meta?.current_page,
      last_page: data.meta?.last_page,
      total: data.meta?.total,
      hasMore: data.meta?.hasMore,
    });
    
    // Ищем пятерочку
    const pyaterochka = discounts.find(d => 
      d.title && (
        d.title.toLowerCase().includes("пятерочка") ||
        d.title.toLowerCase().includes("пятёрочка")
      )
    );
    
    if (pyaterochka) {
      console.log("\n✅ Пятерочка НАЙДЕНА в списке всех скидок:");
      console.log(`   ID: ${pyaterochka.id}`);
      console.log(`   Название: ${pyaterochka.title}`);
      console.log(`   Скидка: ${pyaterochka.discountValue}`);
      console.log(`   Города: ${pyaterochka.cities?.map(c => c.name).join(", ") || "Онлайн"}`);
    } else {
      console.log("\n❌ Пятерочка НЕ найдена в первых 100 скидках");
    }
  } catch (error) {
    console.error(`❌ Ошибка:`, error.message);
  }
}

async function main() {
  console.log("\n🚀 Запуск тестов поиска через фронтенд API");
  console.log("⚠️  ВНИМАНИЕ: Для работы нужна авторизация!");
  console.log("   Запустите dev сервер: npm run dev");
  console.log("   Затем войдите в систему и установите TEST_AUTH_COOKIE");
  
  await testSearch("пятерочка", "Поиск 'пятерочка'");
  await testSearch("пят", "Поиск 'пят'");
  await testAllDiscounts();
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ Тесты завершены");
  console.log("=".repeat(60));
}

main().catch(err => {
  console.error("\n❌ Критическая ошибка:", err);
  process.exit(1);
});

