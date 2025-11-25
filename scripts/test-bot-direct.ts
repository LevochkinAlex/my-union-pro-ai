/**
 * Прямой тест AI бота без HTTP - вызов OpenRouter напрямую
 * Имитирует полный диалог заполнения профиля
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Загружаем .env
dotenv.config();

const prisma = new PrismaClient();

// Конфигурация
const TEST_USER_EMAIL = "ceo@yappix.ru";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Диалог пользователя
const USER_MESSAGES = [
  "Санкт-Петербург",
  "Городская больница №2",
  "Иванов Пётр Сергеевич",
  "15.03.1985",
  "Санкт-Петербург, Невский проспект 25, кв 10",
  "+79211234567",
  "хирург",
  "да",
  "хирург",
  "да",
  "Высшее (специалитет)",
  "да",
  "да, всё верно",
];

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function getSystemPrompt(): Promise<string> {
  return `Ты помощник для вступления в Профсоюз работников здравоохранения РФ. Твоя задача - помочь пользователю заполнить профиль и подготовить необходимые документы.

### ПОСЛЕДОВАТЕЛЬНОСТЬ СБОРА ДАННЫХ:

1. **РЕГИОН**: Спроси: "Укажите регион России, в которой вы находитесь."
2. **ОРГАНИЗАЦИЯ**: Спроси: "Укажите наименование организации, в которой вы работаете."
3. **ФИО**: Спроси: "Укажите вашу фамилию, имя и отчество."
4. **ДАТА РОЖДЕНИЯ**: Спроси: "Укажите дату рождения в формате ДД.ММ.ГГГГ."
5. **АДРЕС**: Спроси: "Укажите ваш адрес проживания."
6. **ТЕЛЕФОН**: Спроси: "Укажите ваш номер телефона."
7. **ДОЛЖНОСТЬ**: Спроси: "Какая у вас должность?"
8. **ПРОФЕССИЯ**: Спроси: "Укажите вашу профессию."
9. **ОБРАЗОВАНИЕ**: Спроси: "Какое у вас образование?"

### ВАЖНО:
- После каждого ответа подтверждай данные с пользователем: "Ваш [поле]: [значение]. Верно?"
- Когда все данные собраны, покажи резюме со всеми полями и спроси финальное подтверждение
- Добавь маркер [PROFILE_COMPLETE] когда пользователь подтвердит все данные`;
}

async function callOpenRouter(messages: ChatMessage[], apiKey: string): Promise<string> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "http://localhost:3004",
      "X-Title": "MyUnion Test",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Ошибка получения ответа";
}

async function runTest() {
  console.log("\n🤖 ПРЯМОЙ ТЕСТ AI БОТА\n");
  console.log("══════════════════════════════════════════════════════════════\n");

  // Получаем API ключ из .env
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.error("❌ OPENROUTER_API_KEY не найден в .env!");
    return;
  }
  
  console.log("✅ API ключ найден:", apiKey.substring(0, 12) + "...\n");

  // Получаем тестового пользователя
  const user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    console.error("❌ Пользователь не найден:", TEST_USER_EMAIL);
    return;
  }

  console.log("✅ Пользователь:", user.email);
  console.log("   ID:", user.id);
  console.log("\n");

  // Начинаем диалог
  const systemPrompt = await getSystemPrompt();
  const chatHistory: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Добавляем приветствие бота
  const welcomeMessage = "Здравствуйте! Я помогу вам вступить в профсоюз. Укажите регион России, в котором вы находитесь.";
  chatHistory.push({ role: "assistant", content: welcomeMessage });

  console.log("🤖 БОТ:", welcomeMessage);
  console.log("");

  // Итерируем по сообщениям пользователя
  for (let i = 0; i < USER_MESSAGES.length; i++) {
    const userMessage = USER_MESSAGES[i];
    
    console.log("─────────────────────────────────────────────────────────");
    console.log(`\n👤 ПОЛЬЗОВАТЕЛЬ [${i + 1}/${USER_MESSAGES.length}]:`, userMessage);
    
    // Добавляем сообщение пользователя
    chatHistory.push({ role: "user", content: userMessage });

    try {
      // Вызываем AI
      const botResponse = await callOpenRouter(chatHistory, apiKey);
      
      // Добавляем ответ бота в историю
      chatHistory.push({ role: "assistant", content: botResponse });
      
      console.log("\n🤖 БОТ:", botResponse);
      
      // Проверяем маркер завершения
      if (botResponse.includes("[PROFILE_COMPLETE]")) {
        console.log("\n\n✅✅✅ ПРОФИЛЬ ЗАВЕРШЁН! ✅✅✅\n");
        break;
      }

      // Пауза между запросами (rate limit)
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error("\n❌ Ошибка:", error);
      break;
    }
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("📊 ИТОГ ДИАЛОГА");
  console.log("──────────────────────────────────────────────────────────────");
  console.log("  Сообщений пользователя:", USER_MESSAGES.length);
  console.log("  Всего в истории:", chatHistory.length);
  console.log("\n");
}

runTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

