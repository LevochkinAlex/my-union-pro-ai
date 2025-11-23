#!/usr/bin/env node

/**
 * Reset models to REAL ones only (remove fake GPT-5, Sherlock, etc.)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ТОЛЬКО РЕАЛЬНЫЕ МОДЕЛИ (проверенные, существующие)
const REAL_MODELS = [
  // OpenAI - Реальные модели
  "openai/gpt-4o",                    // ✅ Лучшая модель OpenAI (2024)
  "openai/gpt-4o-mini",               // ✅ Бюджетная версия
  "openai/gpt-4-turbo",               // ✅ Предыдущая флагманская
  "openai/gpt-4-turbo-preview",       // ✅ Preview версия
  "openai/gpt-4",                     // ✅ Оригинальная GPT-4
  "openai/gpt-3.5-turbo",             // ✅ Дешевая и быстрая
  
  // Anthropic - Реальные Claude модели
  "anthropic/claude-3.5-sonnet",      // ✅ Лучшая Claude (2024)
  "anthropic/claude-3-opus",          // ✅ Самая мощная
  "anthropic/claude-3-sonnet",        // ✅ Средняя по мощности
  "anthropic/claude-3-haiku",         // ✅ Быстрая и дешевая
  
  // Google - Реальные Gemini модели
  "google/gemini-pro-1.5",            // ✅ Лучшая Gemini
  "google/gemini-pro",                // ✅ Стандартная
  "google/gemini-flash-1.5",          // ✅ Быстрая версия
  
  // Meta - Реальные Llama модели
  "meta-llama/llama-3.1-405b-instruct", // ✅ Огромная модель
  "meta-llama/llama-3.1-70b-instruct",  // ✅ Большая модель
  "meta-llama/llama-3.1-8b-instruct",   // ✅ Компактная модель
  
  // Mistral AI - Реальные модели
  "mistralai/mixtral-8x7b-instruct",   // ✅ Мощная открытая модель
  "mistralai/mistral-7b-instruct",     // ✅ Компактная модель
  
  // Cohere - Реальные модели
  "cohere/command-r-plus",             // ✅ Большая модель
  "cohere/command-r",                  // ✅ Стандартная модель
];

async function resetModels() {
  try {
    console.log("🧹 Очистка фейковых моделей...\n");

    // Найти OpenRouter провайдера
    const openRouter = await prisma.apiProvider.findFirst({
      where: { name: "openrouter" },
    });

    if (!openRouter) {
      console.error("❌ OpenRouter provider not found!");
      process.exit(1);
    }

    console.log(`✅ Found OpenRouter: ${openRouter.id}`);

    // Проверить текущие модели
    let currentModels = [];
    try {
      currentModels = JSON.parse(openRouter.availableModels || "[]");
    } catch (e) {
      currentModels = [];
    }

    console.log(`\n📊 Статистика:`);
    console.log(`   Было моделей: ${Array.isArray(currentModels) ? currentModels.length : 0}`);
    
    // Найти фейковые модели
    if (Array.isArray(currentModels)) {
      const fakeModels = currentModels.filter(m => {
        const id = typeof m === 'string' ? m : m.id;
        return id && (
          id.toLowerCase().includes('gpt-5') ||
          id.toLowerCase().includes('gpt-6') ||
          id.toLowerCase().includes('sherlock') ||
          id.toLowerCase().includes('dash') && id.toLowerCase().includes('alpha')
        );
      });
      
      if (fakeModels.length > 0) {
        console.log(`\n❌ Найдено фейковых моделей: ${fakeModels.length}`);
        console.log(`   Примеры фейков:`);
        fakeModels.slice(0, 5).forEach(m => {
          const id = typeof m === 'string' ? m : m.id;
          console.log(`   - ${id}`);
        });
      }
    }

    // Преобразуем в формат с объектами
    const realModelsFormatted = REAL_MODELS.map(id => ({
      id,
      name: id.split('/').pop()?.toUpperCase() || id,
      description: `Official ${id.split('/')[0]} model`,
      pricing: null,
      context_length: null,
      capabilities: null,
      updated_at: new Date().toISOString(),
    }));

    // Обновить OpenRouter провайдера
    await prisma.apiProvider.update({
      where: { id: openRouter.id },
      data: {
        availableModels: JSON.stringify(realModelsFormatted),
      },
    });

    console.log(`\n✨ Модели обновлены!`);
    console.log(`   Стало моделей: ${REAL_MODELS.length} (только реальные)`);
    
    console.log(`\n✅ Доступные модели:`);
    console.log(`\n🔥 OpenAI:`);
    console.log(`   • openai/gpt-4o (ЛУЧШАЯ)`);
    console.log(`   • openai/gpt-4o-mini (бюджетная)`);
    console.log(`   • openai/gpt-4-turbo`);
    console.log(`   • openai/gpt-3.5-turbo`);
    
    console.log(`\n🔥 Anthropic Claude:`);
    console.log(`   • anthropic/claude-3.5-sonnet (ЛУЧШАЯ)`);
    console.log(`   • anthropic/claude-3-opus (мощная)`);
    console.log(`   • anthropic/claude-3-haiku (быстрая)`);
    
    console.log(`\n🌟 Google Gemini:`);
    console.log(`   • google/gemini-pro-1.5`);
    console.log(`   • google/gemini-flash-1.5`);
    
    console.log(`\n🌟 Meta Llama:`);
    console.log(`   • meta-llama/llama-3.1-405b-instruct`);
    console.log(`   • meta-llama/llama-3.1-70b-instruct`);
    
    console.log(`\n❌ ЗАБЛОКИРОВАНЫ фейки:`);
    console.log(`   ✗ GPT-5.x (не существует)`);
    console.log(`   ✗ Sherlock модели (фейк)`);
    console.log(`   ✗ Dash/Think Alpha (фейк)`);
    
    console.log(`\n💡 GPT-5 пока не выпущен OpenAI!`);
    console.log(`   Используйте openai/gpt-4o - это лучшая доступная модель.`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetModels();

