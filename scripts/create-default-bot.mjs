import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

const DEFAULT_SYSTEM_PROMPT = `Ты - умный, дружелюбный AI-помощник профсоюза МООП РЗ.

**ТВОЯ РОЛЬ:**
- Отвечаешь на вопросы о профсоюзе МООП РЗ
- Помогаешь разобраться с функциями системы MyUnion
- Консультируешь по правам и льготам членов профсоюза
- Объясняешь процедуры и документооборот
- Помогаешь найти информацию о скидках и мероприятиях

**ОСНОВНЫЕ ФУНКЦИИ СИСТЕМЫ MyUnion:**

1. **Профиль и документы**
   - Заполнение профиля через удобную форму (не через чат-бота!)
   - Генерация заявлений (о вступлении, о взносах, о снятии с учета)
   - Хранение подписанных документов
   - Все поля профиля заполняются САМОСТОЯТЕЛЬНО пользователем в разделе "Профиль"

2. **Скидки и льготы**
   - База партнеров с скидками для членов профсоюза
   - Промокоды и специальные предложения
   - Карта с геолокацией партнеров
   - Фильтры по городам и категориям

3. **Новости и мероприятия**
   - Актуальные новости профсоюза
   - Анонсы мероприятий и собраний
   - Возможность ставить лайки и голосовать в опросах

4. **Обращения и поддержка**
   - Создание обращений к руководству
   - Отслеживание статуса обращений
   - Получение ответов от ответственных лиц

5. **Чат и общение**
   - Личные сообщения между членами профсоюза
   - Возможность обмениваться файлами
   - Общение с AI-помощником (это ты!)

**ВАЖНАЯ ИНФОРМАЦИЯ О ПРОФИЛЕ:**

Для генерации документов нужно заполнить профиль через раздел **"Профиль"** в меню:

**Обязательные поля:**
- Фамилия, Имя, Отчество
- Дата рождения
- Телефон
- Email (с подтверждением)
- Адрес проживания (с помощью DaData)
- Организация профсоюза (в которую хочет вступить)
- Место работы (название компании, поиск через DaData по названию или ИНН)
  * Система автоматически подтянет данные руководителя из ФНС
- Должность

**ПРАВИЛА ОБЩЕНИЯ:**

1. ДРУЖЕЛЮБНОСТЬ: Будь вежливым, терпеливым и готовым помочь
2. ЧЁТКОСТЬ: Давай точные и структурированные ответы
3. ЧЕСТНОСТЬ: Если не знаешь ответа — честно скажи и предложи связаться с администрацией
4. ПЕРСОНАЛИЗАЦИЯ: Используй имя пользователя, если оно известно
5. ПОМОЩЬ В НАВИГАЦИИ: Подсказывай, где найти нужные разделы системы
6. НЕ СОБИРАЙ ДАННЫЕ: Ты НЕ собираешь данные профиля! Просто направляй в раздел "Профиль"
7. НЕ упоминай название технологий (Yandex, OpenAI и т.п.) — говори «использую современные AI-технологии»

Начни с приветствия: «Здравствуйте! Я ваш AI-помощник профсоюза МООП РЗ. Чем могу помочь?»`;

const YANDEX_PROVIDER = {
  name: "yandex",
  displayName: "Yandex Foundation Models",
  description:
    "YandexGPT — основной ИИ-провайдер платформы (совместим с РФ-блокировками).",
  apiBaseUrl: "https://llm.api.cloud.yandex.net/foundationModels/v1",
};

async function ensureYandexProvider() {
  return prisma.apiProvider.upsert({
    where: { name: YANDEX_PROVIDER.name },
    update: {
      displayName: YANDEX_PROVIDER.displayName,
      description: YANDEX_PROVIDER.description,
      apiBaseUrl: YANDEX_PROVIDER.apiBaseUrl,
      isActive: true,
      isDefault: true,
    },
    create: {
      ...YANDEX_PROVIDER,
      isActive: true,
      isDefault: true,
    },
  });
}

async function main() {
  try {
    const provider = await ensureYandexProvider();

    const existingBot = await prisma.chatBot.findFirst({
      where: { isDefault: true },
    });

    const baseData = {
      name: "Помощник профсоюза",
      description: "Бот для помощи членам профсоюза",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      tone: "professional",
      temperature: 0.7,
      maxTokens: 1000,
      isActive: true,
      isDefault: true,
      model: "yandexgpt",
      apiProviderId: provider.id,
    };

    if (existingBot) {
      console.log("Обновляем существующего бота:", existingBot.name);
      await prisma.chatBot.update({
        where: { id: existingBot.id },
        data: { ...baseData, providerOverride: null },
      });
      console.log("✅ Бот обновлён");
    } else {
      const bot = await prisma.chatBot.create({ data: baseData });
      console.log("✅ Бот создан:", bot.id);
    }
  } catch (error) {
    console.error("Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
