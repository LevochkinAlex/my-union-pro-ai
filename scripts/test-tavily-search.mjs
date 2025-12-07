#!/usr/bin/env node
/**
 * Тест поиска через Tavily API
 * Используется для проверки работы веб-поиска в чатах
 */

import "dotenv/config";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

if (!TAVILY_API_KEY) {
  console.error("❌ TAVILY_API_KEY не найден в переменных окружения");
  process.exit(1);
}

console.log("🔍 Тестирование Tavily API...");
console.log(`Ключ: ${TAVILY_API_KEY.substring(0, 20)}...`);

async function testSearch() {
  try {
    const query = "председатель МООП РЗ РФ профсоюз";
    
    console.log(`\n📝 Поисковый запрос: "${query}"\n`);

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        include_domains: [],
        exclude_domains: [],
        max_results: 3,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Ошибка API (${response.status}):`, errorText);
      process.exit(1);
    }

    const data = await response.json();
    const results = data.results || [];

    console.log(`✅ Найдено результатов: ${results.length}\n`);

    if (results.length === 0) {
      console.log("⚠️  Результаты не найдены");
      return;
    }

    results.forEach((result, index) => {
      console.log(`--- Результат ${index + 1} ---`);
      console.log(`Заголовок: ${result.title || "Нет заголовка"}`);
      console.log(`URL: ${result.url || "Нет URL"}`);
      console.log(`Сниппет: ${(result.content || result.snippet || "Нет описания").substring(0, 200)}...`);
      console.log("");
    });

    console.log("✅ Тест пройден успешно!");
  } catch (error) {
    console.error("❌ Ошибка при выполнении запроса:", error.message);
    process.exit(1);
  }
}

testSearch();

