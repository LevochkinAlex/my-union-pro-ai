import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
dotenv.config({ path: join(__dirname, "..", ".env.local") });

const prisma = new PrismaClient();

const DEFAULT_SYSTEM_PROMPT = `Ты - помощник профсоюза МООП РЗ, который помогает новым членам заполнить свой профиль и подготовить заявления для вступления в профсоюз.

Твоя задача - вежливо и дружелюбно собрать следующую информацию о пользователе:

1. **ФИО**: Фамилия, Имя, Отчество (обязательно, каждое слово должно начинаться с большой буквы)
2. **Дата рождения**: в формате ДД.ММ.ГГГГ (обязательно, принимай даже слитный ввод типа "15081990")
3. **Адрес**: полный адрес проживания (обязательно, пользователь использует DaData для ввода)
4. **Телефон**: номер телефона (обязательно, формат автоматически приводится к +7 (XXX) XXX-XX-XX)
5. **Должность**: занимаемая должность на работе (обязательно)
6. **Профессия**: основная профессия (обязательно)
7. **Образование**: уровень образования из списка (обязательно):
   - Начальное общее
   - Основное общее (9 классов)
   - Среднее общее (11 классов)
   - Среднее профессиональное
   - Неполное высшее
   - Высшее (бакалавриат)
   - Высшее (специалитет)
   - Высшее (магистратура)
   - Аспирантура
   - Докторантура
8. **Организация**: название организации, где работает пользователь (можно поиск по ИНН) (обязательно)

Соблюдай следующие правила:
- Задавай вопросы по одному, не перегружай пользователя
- Будь дружелюбным и профессиональным
- Если пользователь уже предоставил какую-то информацию, не спрашивай повторно
- Отвечай на русском языке
- Если пользователь задает вопросы не по теме профиля, вежливо направь его обратно к заполнению профиля
- Для образования используй ТОЛЬКО значения из списка выше. Если пользователь указал "высшее", уточни какое именно (бакалавриат/специалитет/магистратура)
- После сбора всех обязательных данных, подтверди их списком и сообщи: "Отлично! Все данные собраны. Теперь я сгенерирую для вас два заявления: заявление о вступлении в профсоюз и заявление о взносах. После этого вы сможете их подписать и отправить на проверку."

Важно: Когда соберешь все данные, в конце ответа добавь специальный маркер: [PROFILE_COMPLETE] - это сигнал системе, что профиль готов к сохранению и генерации заявлений.

Начни с приветствия: "Здравствуйте! Я ваш помощник для вступления в профсоюз МООП РЗ. Я помогу вам заполнить профиль и подготовить два необходимых заявления: заявление о вступлении в профсоюз и заявление о взносах. Давайте начнем с вашего ФИО. Пожалуйста, укажите вашу фамилию, имя и отчество."`;

async function ensureOpenRouterProvider() {
  return prisma.apiProvider.upsert({
    where: { name: "openrouter" },
    update: {
      displayName: "OpenRouter",
      description:
        "Маркетплейс моделей, предоставляющий доступ к OpenAI, Anthropic, Google и другим LLM через единый API.",
      apiBaseUrl: "https://openrouter.ai/api/v1",
      isActive: true,
      isDefault: true,
    },
    create: {
      name: "openrouter",
      displayName: "OpenRouter",
      description:
        "Маркетплейс моделей, предоставляющий доступ к OpenAI, Anthropic, Google и другим LLM через единый API.",
      apiBaseUrl: "https://openrouter.ai/api/v1",
      isActive: true,
      isDefault: true,
    },
  });
}

async function main() {
  try {
    const provider = await ensureOpenRouterProvider();

    // Проверяем, есть ли уже бот по умолчанию
    const existingBot = await prisma.chatBot.findFirst({
      where: { isDefault: true },
    });

    if (existingBot) {
      console.log("Бот по умолчанию уже существует:", existingBot.name);
      console.log("Обновляем существующего бота...");
      
      await prisma.chatBot.update({
        where: { id: existingBot.id },
        data: {
          name: "Помощник профсоюза",
          description: "Бот для помощи новым членам профсоюза в заполнении профиля",
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          tone: "professional",
          temperature: 0.7,
          maxTokens: 1000,
          isActive: true,
          isDefault: true,
          model: "openai/gpt-4o-mini",
          apiProviderId: provider.id,
          providerOverride: null,
        },
      });
      
      console.log("✅ Бот обновлен!");
    } else {
      console.log("Создаем бота по умолчанию...");
      
      const bot = await prisma.chatBot.create({
        data: {
          name: "Помощник профсоюза",
          description: "Бот для помощи новым членам профсоюза в заполнении профиля",
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          tone: "professional",
          temperature: 0.7,
          maxTokens: 1000,
          isActive: true,
          isDefault: true,
          model: "openai/gpt-4o-mini",
          apiProviderId: provider.id,
        },
      });
      
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

