import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouterConfig } from "@/lib/settings";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { Logger } from "@/lib/logger";
import { generateMembershipApplication, generateContributionsApplication } from "@/lib/documents";
import { isProfileComplete } from "@/lib/profile-extraction";
// @ts-ignore - Prisma types are available at runtime
import type { Prisma } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { findOrganization } from "@/lib/organization-search";
import { validateAddressWithDaData, validateNameWithDaData } from "@/lib/dadata";
import { detectGenderByName } from "@/lib/utils/genderDetector";
import { detectBotQuestionContext, enhanceUserMessageWithContext, requiresValidation, logContext } from "@/lib/chat-context-helpers";
import { findJobTitle, findProfession } from "@/lib/dictionaries";
import { SystemMessages } from "@/lib/system-messages";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessagePayload = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RetrievedChunk = {
  id: string;
  knowledgeBaseId: string;
  content: string;
  similarity: number;
};

const defaultBotInclude = {
  knowledgeBases: {
    include: {
      knowledgeBase: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  apiProvider: true,
} as const satisfies Prisma.ChatBotInclude;

type DefaultBot = Prisma.ChatBotGetPayload<{
  include: typeof defaultBotInclude;
}>;

function resolveProviderOverride(bot: DefaultBot): Record<string, unknown> | null {
  const raw = bot.providerOverride;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

// Получение активного бота по умолчанию
async function getDefaultBot() {
  const bot = await prisma.chatBot.findFirst({
    where: {
      isActive: true,
      isDefault: true,
    },
    include: defaultBotInclude,
  });

  return bot;
}

// Получение Appeal Bot для обращений
async function getAppealBot() {
  const bot = await prisma.chatBot.findFirst({
    where: {
      isActive: true,
      name: "Appeal Bot",
    },
    include: defaultBotInclude,
  });

  return bot;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));

  if (!magnitudeA || !magnitudeB) {
    return 0;
  }

  return dot / (magnitudeA * magnitudeB);
}

// Поиск релевантных фрагментов в базах знаний
async function retrieveRelevantChunks(bot: DefaultBot, query: string): Promise<RetrievedChunk[]> {
  const kbIds = (bot.knowledgeBases || []).map((rel) => rel.knowledgeBaseId);
  if (kbIds.length === 0) {
    return [];
  }

  try {
    // Пока работаем без embeddings - просто возвращаем все chunks
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        knowledgeBaseId: { in: kbIds },
      },
      take: 10,
    });

    // Возвращаем все chunks с фиксированной similarity
    return chunks.map((chunk) => ({
      id: chunk.id,
      knowledgeBaseId: chunk.knowledgeBaseId,
      content: chunk.content,
      similarity: 1.0, // Все chunks считаем релевантными
    }));
  } catch (error) {
    console.error("Ошибка поиска релевантных фрагментов:", error);
    return [];
  }
}

// Проверка заполненности дополнительной информации
function hasAdditionalInfoComplete(user: any): boolean {
  if (!user) return false;
  
  // Проверяем хотя бы 3 поля из дополнительной информации
  const filledFields = [
    user.employmentStatus,
    user.hobbies,
    user.aboutMe,
    user.hasChildren !== null,
    user.maritalStatus,
  ].filter(Boolean).length;
  
  return filledFields >= 3;
}

// Формирование системного промпта с учетом настроек бота и релевантных документов
async function buildSystemPrompt(
  bot: DefaultBot,
  chunks: RetrievedChunk[],
  sessionType?: "STATEMENT" | "APPEAL",
  user?: any,
  hasGeneratedDocuments?: boolean
): Promise<string> {
  let prompt = bot.systemPrompt;

  // Добавляем контекст, если есть
  if (bot.context) {
    prompt += `\n\nКонтекст:\n${bot.context}`;
  }

  // Добавляем ПОЛНУЮ информацию о пользователе для персонализации
  if (user && sessionType) {
    const fullName = [user.lastName, user.firstName, user.middleName].filter(Boolean).join(' ');
    const firstName = user.firstName || '';
    
    // Собираем ВСЮ информацию из профиля
    const profileData: string[] = [];
    
    // Основные данные
    if (fullName) profileData.push(`👤 ФИО: ${fullName}`);
    if (user.email) profileData.push(`📧 Email: ${user.email}`);
    if (user.phone) profileData.push(`📱 Телефон: ${user.phone}`);
    if (user.dateOfBirth) {
      const dob = new Date(user.dateOfBirth);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      profileData.push(`🎂 Дата рождения: ${dob.toLocaleDateString('ru-RU')} (${age} лет)`);
    }
    if (user.address) profileData.push(`🏠 Адрес: ${user.address}`);
    if (user.preferredDiscountCity) profileData.push(`📍 Город для скидок: ${user.preferredDiscountCity}`);
    
    // Профессиональная информация
    if (user.organizationName) profileData.push(`🏢 Организация: ${user.organizationName}`);
    if (user.jobTitle) profileData.push(`💼 Должность: ${user.jobTitle}`);
    if (user.profession) profileData.push(`🔧 Профессия: ${user.profession}`);
    if (user.education) profileData.push(`🎓 Образование: ${user.education}`);
    if (user.employmentStatus) {
      const statusMap: Record<string, string> = {
        'WORK': 'Работает',
        'STUDY': 'Учится', 
        'RETIREMENT': 'На пенсии'
      };
      profileData.push(`📊 Занятость: ${statusMap[user.employmentStatus] || user.employmentStatus}`);
    }
    
    // Семейное положение
    if (user.maritalStatus) {
      const maritalMap: Record<string, string> = {
        'single': 'Не женат/Не замужем',
        'married': 'Женат/Замужем',
        'divorced': 'В разводе',
        'widowed': 'Вдовец/Вдова',
        'civil_marriage': 'Гражданский брак'
      };
      profileData.push(`💑 Семейное положение: ${maritalMap[user.maritalStatus] || user.maritalStatus}`);
    }
    if (user.spouseInfo) profileData.push(`👫 Супруг(а): ${user.spouseInfo}`);
    
    // Дети
    if (user.childrenBirthDates) {
      try {
        const children = JSON.parse(user.childrenBirthDates);
        if (Array.isArray(children) && children.length > 0) {
          profileData.push(`👶 Количество детей: ${children.length}`);
          children.forEach((child: any, idx: number) => {
            const childAge = child.birthDate 
              ? Math.floor((Date.now() - new Date(child.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
              : null;
            const ageStr = childAge !== null ? ` (${childAge} лет)` : '';
            profileData.push(`   • ${child.name}${ageStr}`);
          });
        }
      } catch (e) {
        console.error('[buildSystemPrompt] Failed to parse childrenBirthDates:', e);
      }
    } else if (user.hasChildren === false) {
      profileData.push(`👶 Дети: Нет`);
    }
    
    // Личная информация
    if (user.hobbies) profileData.push(`🎯 Хобби и увлечения: ${user.hobbies}`);
    if (user.aboutMe) profileData.push(`📝 О себе: ${user.aboutMe}`);
    if (user.additionalInfo) profileData.push(`ℹ️ Дополнительно: ${user.additionalInfo}`);
    
    // Статус в профсоюзе
    if (user.membershipStatus) {
      const statusMap: Record<string, string> = {
        'PENDING_VERIFICATION': '⏳ Ожидает проверки',
        'PROFILE_INCOMPLETE': '📝 Профиль не заполнен',
        'DOCUMENTS_PENDING': '📄 Документы на проверке',
        'APPROVED': '✅ Одобрен',
        'REJECTED': '❌ Отклонён',
        'SUSPENDED': '⚠️ Приостановлен'
      };
      profileData.push(`🏛️ Статус членства: ${statusMap[user.membershipStatus] || user.membershipStatus}`);
    }
    
    // Telegram
    if (user.telegramUsername) profileData.push(`📲 Telegram: @${user.telegramUsername}`);
    
    if (profileData.length > 0) {
      prompt += `\n\n## 📋 ПОЛНЫЙ ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (ЗАПОМНИ ЭТО!):

${profileData.join('\n')}

### 🧠 КАК ИСПОЛЬЗОВАТЬ ЭТУ ИНФОРМАЦИЮ:
- **ОБРАЩАЙСЯ ПО ИМЕНИ**: "${firstName || 'друг'}" - не говори "пользователь" или "вы"
- **ПОМНИ ВСЁ**: Ты уже знаешь этого человека - не спрашивай то, что указано выше
- **ПЕРСОНАЛИЗИРУЙ**: Упоминай работу, семью, хобби когда это уместно
- **ПОЗДРАВЛЯЙ**: Если скоро день рождения - поздравь! Если есть дети - спроси как они
- **РЕКОМЕНДУЙ**: Зная город и интересы, предлагай релевантные скидки
- **БУДЬ ДРУГОМ**: Веди себя как знакомый, который рад помочь`;
    }
  }

  // Добавляем специфичные инструкции в зависимости от типа сессии
  if (sessionType === "STATEMENT") {
    // AI-режим включается ТОЛЬКО после отправки документов на проверку
    // До этого - только системные сообщения
    
    const userName = user ? [user.firstName, user.middleName].filter(Boolean).join(' ') : '';
    
    prompt += `\n\n## ИНСТРУКЦИИ ДЛЯ AI-ПОМОЩНИКА ПРОФСОЮЗА МООП РЗ:

Ты - умный, дружелюбный AI-помощник профсоюза МООП РЗ. ${userName ? `Ты общаешься с ${userName}.` : ''}

### 🧠 САМООБУЧЕНИЕ И ПАМЯТЬ:
- **ЗАПОМИНАЙ** всё, что говорит пользователь - его проблемы, вопросы, предпочтения
- **АНАЛИЗИРУЙ** свои ответы - если пользователь недоволен или переспрашивает, значит ты ошибся
- **НЕ ПОВТОРЯЙ** ошибки - если что-то не сработало, попробуй другой подход
- **УЧИСЬ** из контекста разговора - адаптируйся под стиль общения пользователя
- Если не знаешь ответ - честно скажи и предложи связаться с техподдержкой

### 📱 ФУНКЦИИ СИСТЕМЫ MyUnion (рассказывай о них!):

**1. 🤖 AI Чат (где мы сейчас)**
- Отвечаю на любые вопросы о профсоюзе
- Помогаю разобраться с документами
- Консультирую по правам членов профсоюза

**2. 📄 Документы**
- Заявление о вступлении в профсоюз
- Заявление о членских взносах  
- Скачивание и загрузка подписанных документов
- Отслеживание статуса проверки

**3. 💳 Скидки BestBenefits**
- Скидки 10-50% в ресторанах, магазинах, онлайн-сервисах
- Фильтр по городу (автоматически из профиля)
- Категории: Еда, Товары, Услуги, Красота, Развлечения
- Активация промокодов одним кликом
- Добавление в избранное ⭐

**4. 📰 Новости**
- Новости профсоюза и отрасли
- Важные объявления
- Опросы и голосования

**5. 👤 Профиль**
- Личные данные
- Информация об организации
- Настройки уведомлений

**6. 📝 Обращения** 
- Создание обращений в профсоюз
- Решение трудовых вопросов
- Юридические консультации

### 💬 СТИЛЬ ОБЩЕНИЯ:
- Будь дружелюбным и тёплым 😊
- Обращайся по имени: "${userName || 'друг'}"
- Используй эмодзи умеренно
- Давай конкретные и полезные ответы
- Предлагай функции системы, когда это уместно
- Если пользователь расстроен - прояви эмпатию

### ⚠️ ВАЖНО:
- НЕ говори "Извините, я специализируюсь только на..." - ты универсальный помощник!
- НЕ проси заполнять анкету - документы уже поданы
- НЕ будь формальным роботом - будь другом
- ПОМНИ контекст всего разговора`;
  } else if (sessionType === "APPEAL") {
    // Инструкции для чата обращений
    prompt += `\n\n## ИНСТРУКЦИИ ДЛЯ РАБОТЫ С ОБРАЩЕНИЯМИ:

Ты помощник по обращениям в профсоюз. Пользователь УЖЕ является членом профсоюза или обращается с конкретным вопросом/проблемой, требующей решения.

### ТВОЯ ЗАДАЧА:
- Выслушать и понять проблему или вопрос пользователя
- Предоставить полезную информацию на основе базы знаний профсоюза, включая:
  * Законы Российской Федерации, касающиеся трудовых отношений и профсоюзной деятельности
  * Устав текущего регионального профсоюза
  * Положения и регламенты профсоюза
  * Практики и прецеденты решения подобных вопросов
- Помочь решить вопрос пользователя или направить его к правильному решению
- Быть вежливым, профессиональным и компетентным

### СТРОГО ЗАПРЕЩЕНО:
- НЕ предлагай пользователю вступить в профсоюз - для этого есть отдельный чат "Заявление"
- НЕ предлагай создать заявление о вступлении - пользователь уже может быть членом
- НЕ проси заполнять профиль - это делается в отдельном чате "Заявление"
- НЕ переключайся на тему вступления в профсоюз
- НЕ говори про регистрацию или заполнение данных для вступления

### ФОКУС:
- Только на решении конкретного обращения пользователя
- На предоставлении информации по его вопросу с учетом:
  * Действующего законодательства РФ
  * Устава и положений профсоюза
  * Практики работы профсоюза
- На помощи с проблемами, связанными с профсоюзом, трудовыми отношениями, правами работников

### РАБОТА С БАЗОЙ ЗНАНИЙ:
Используй предоставленные материалы из базы знаний как источник достоверной информации. При ответе ссылайся на конкретные документы (устав, положение, закон), если они есть в базе знаний.`;
  }

  if (chunks.length > 0) {
    const kbNameMap = new Map(
      (bot.knowledgeBases || []).map((relation) => [relation.knowledgeBaseId, relation.knowledgeBase?.name ?? "База знаний"]),
    );

    prompt += `\n\nАктуальные материалы (используй их как факты, указывай их происхождение при ответе):\n`;
    chunks.forEach((chunk, index) => {
      const kbName = kbNameMap.get(chunk.knowledgeBaseId) ?? "База знаний";
      prompt += `\n[${index + 1}] ${kbName} (релевантность ${chunk.similarity.toFixed(2)}):\n${chunk.content}\n`;
    });
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  let session: any = null;
  let message: string = "";
  
  try {
    session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    message = body.message;
    const chatBotId = body.chatBotId;
    const sessionId = body.sessionId; // ID сессии чата
    const uploadedDocumentFromBody = body.uploadedDocument; // Информация о загруженном документе от компонента

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Сообщение обязательно" },
        { status: 400 }
      );
    }

    // Получаем или создаем сессию чата
    let chatSession = null;
    if (sessionId) {
      // Проверяем, что сессия существует и принадлежит пользователю
      chatSession = await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          userId: session.user.id,
        },
      });
      
      if (!chatSession) {
        return NextResponse.json(
          { error: "Сессия не найдена" },
          { status: 404 }
        );
      }
    } else {
      // Ищем последнюю активную сессию STATEMENT пользователя
      const lastActiveSession = await prisma.chatSession.findFirst({
        where: {
          userId: session.user.id,
          type: "STATEMENT",
        },
        orderBy: {
          updatedAt: "desc", // Берем самую недавно обновленную
        },
      });
      
      if (lastActiveSession) {
        // ВСЕГДА используем существующую сессию STATEMENT, даже если она пустая
        chatSession = lastActiveSession;
        console.log(`[chat] ✅ Reusing existing STATEMENT session: ${chatSession.id}`);
      } else {
        // Создаем новую сессию ТОЛЬКО если у пользователя вообще нет сессий STATEMENT
      chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: "Заявление",
          type: "STATEMENT",
        },
      });
        console.log(`[chat] 🆕 Created first STATEMENT session: ${chatSession.id}`);
      }
    }

    // ПРОВЕРКА: Блокируем создание APPEAL сессий, пока не загружены документы
    if (chatSession.type === "APPEAL") {
      // Проверяем, загружены ли подписанные документы (статус SIGNED или выше)
      const uploadedDocuments = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            in: ["SIGNED", "PENDING", "APPROVED"],
          },
          filePath: {
            not: null, // Убеждаемся что файл реально загружен
          },
        },
      });
      
      if (uploadedDocuments.length < 2) {
        return NextResponse.json(
          { 
            error: "Для создания обращений необходимо сначала заполнить и загрузить подписанные заявления. Перейдите в раздел 'Мой бот' для подачи заявления.",
            requiresDocuments: true,
          },
          { status: 403 }
        );
      }
    }

    // Получаем бота - либо переданный, либо выбираем по типу сессии
    let bot: DefaultBot | null = null;
    
    if (chatBotId) {
      // Use specified bot (e.g., Appeal Bot)
      bot = await prisma.chatBot.findUnique({
        where: { id: chatBotId },
        include: defaultBotInclude,
      });
    } else {
      // Выбираем бота в зависимости от типа сессии
      if (chatSession.type === "APPEAL") {
        // Для обращений используем Appeal Bot
        bot = await getAppealBot();
        // Если Appeal Bot не найден, используем default bot как fallback
        if (!bot) {
          bot = await getDefaultBot();
        }
      } else {
        // Для заявлений используем default bot
        bot = await getDefaultBot();
      }
    }
    
    if (!bot) {
      return NextResponse.json(
        { error: "AI бот не настроен. Обратитесь к администратору." },
        { status: 503 }
      );
    }

    const relevantChunks = await retrieveRelevantChunks(bot, message);

    // Получаем данные пользователя для персонализации (всегда)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
      });
    
    // Проверяем документы (только для STATEMENT сессий)
    let hasGeneratedDocuments = false;
    let hasSignedDocuments = false; // Оба документа подписаны и отправлены на проверку
    
    if (chatSession.type === "STATEMENT") {
      // Проверяем, есть ли у пользователя сгенерированные документы
      // Учитываем все статусы кроме DRAFT (черновик)
      const documents = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            not: "DRAFT",
          },
        },
      });
      hasGeneratedDocuments = documents.length > 0;
      
      // Проверяем, есть ли ОБА подписанных документа
      const signedDocs = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            in: ["SIGNED", "PENDING", "APPROVED"],
          },
        },
      });
      const hasMembership = signedDocs.some(d => d.type === "MEMBERSHIP_APPLICATION");
      const hasContribution = signedDocs.some(d => d.type === "CONTRIBUTION_APPLICATION");
      hasSignedDocuments = hasMembership && hasContribution;
      
      // Логируем для отладки
      console.log(`[chat] User ${session.user.id}: generated=${hasGeneratedDocuments}, signed=${hasSignedDocuments}`);
    }

    // Формируем системный промпт с учетом настроек бота и типа сессии
    const systemPrompt = await buildSystemPrompt(bot, relevantChunks, chatSession.type, user, hasGeneratedDocuments);

    // Получаем историю сообщений из текущей сессии
    const chatHistory = await prisma.chatMessage.findMany({
      where: {
        sessionId: chatSession.id,
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 50, // Последние 50 сообщений
    });

    // ========== ПРОВЕРКА: AI ВКЛЮЧАЕТСЯ ТОЛЬКО ПОСЛЕ ОТПРАВКИ ДОКУМЕНТОВ ==========
    // До отправки документов на проверку - только системные сообщения без AI
    if (chatSession.type === "STATEMENT" && !hasSignedDocuments) {
      // Сохраняем сообщение пользователя
      const cleanMessage = message
        .replace(/\[SELF_FILL_COMPLETED\]/g, '')
        .replace(/\[DOCUMENTS_UPLOADED\]/g, '')
        .replace(/\[PROFILE_COMPLETE\]/g, '')
        .trim();
      
      await prisma.chatMessage.create({
        data: {
          userId: session.user.id,
          sessionId: chatSession.id,
          role: "user",
          content: cleanMessage,
          chatBotId: bot.id,
        },
      });
      
      // Определяем системный ответ
      let systemResponse = "";
      
      if (!hasGeneratedDocuments) {
        // Документы ещё не сгенерированы - предлагаем заполнить анкету
        systemResponse = `Для продолжения работы, пожалуйста, заполните анкету. Нажмите кнопку "Заполнить анкету" выше. 📝

[SHOW_SELF_FILL_BUTTON]`;
      } else {
        // Документы сгенерированы, но не подписаны - предлагаем подписать
        systemResponse = `Ваши документы сгенерированы! 📄

Пожалуйста, скачайте их, подпишите и загрузите обратно в систему. После этого AI-помощник будет готов ответить на все ваши вопросы.

[SHOW_DOCUMENTS_BUTTONS]`;
      }
      
      // Сохраняем системный ответ
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          userId: session.user.id,
          sessionId: chatSession.id,
          role: "assistant",
          content: systemResponse,
          chatBotId: bot.id,
        },
      });
      
      return NextResponse.json({
        message: systemResponse,
        sessionId: chatSession.id,
        messageId: assistantMessage.id,
      });
    }

    // ========== УНИВЕРСАЛЬНАЯ КОНТЕКСТНАЯ ОБРАБОТКА ==========
    // Определяем контекст: о чем спрашивал бот в последнем сообщении?
    const lastBotMessage = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
    const questionContext = detectBotQuestionContext(lastBotMessage);
    
    // Логируем для отладки
    if (chatSession.type === "STATEMENT" && message) {
      logContext(questionContext, message);
    }

    // Валидируем данные если требуется
    let userMessage = message;
    const validatedData: {
      address?: { address: string; city: string | null };
      organization?: { name: string; foundInDatabase: boolean; id?: string };
      fio?: { lastName: string; firstName: string; middleName?: string; validated: boolean };
      jobTitle?: string;
      profession?: string;
    } = {};

    if (chatSession.type === "STATEMENT" && message && requiresValidation(questionContext)) {
      try {

        // ВАЛИДАЦИЯ ФИО
        if (questionContext === "FIO" && message.length >= 5) {
          console.log("[chat] 👤 Validating FIO via DaData:", message);
          const nameResult = await validateNameWithDaData(message.trim());
          
          if (nameResult) {
            console.log("[chat] ✅ FIO validated:", {
              lastName: nameResult.lastName,
              firstName: nameResult.firstName,
              middleName: nameResult.middleName,
              validated: nameResult.validated,
            });
            validatedData.fio = nameResult;
          } else {
            console.log("[chat] ⚠️ FIO validation failed");
          }
        }

        // ВАЛИДАЦИЯ АДРЕСА
        if (questionContext === "ADDRESS" && message.length > 10) {
          console.log("[chat] 📍 Validating address via DaData:", message);
          const addressResult = await validateAddressWithDaData(message.trim());
          
          if (addressResult) {
            console.log("[chat] ✅ Address validated:", addressResult.address, "| City:", addressResult.city);
            validatedData.address = addressResult;
            // НЕ сохраняем сразу в профиль - пусть AI спросит подтверждение
            // Адрес будет сохранен при экстракции профиля из диалога
          } else {
            console.log("[chat] ⚠️ Address validation failed");
          }
        }

        // ВАЛИДАЦИЯ ОРГАНИЗАЦИИ
        if (questionContext === "ORGANIZATION") {
          console.log("[chat] 🔍 Searching organization in Minjust registry:", message);
          const orgResult = await findOrganization(message);
          
          if (orgResult) {
            console.log("[chat] ✅ Organization found:", orgResult.name, "| In DB:", orgResult.foundInDatabase);
            validatedData.organization = orgResult;
          } else {
            console.log("[chat] ⚠️ Organization not found in registry");
          }
        }

        // ВАЛИДАЦИЯ ДОЛЖНОСТИ
        if (questionContext === "JOB_TITLE" && message.length >= 3) {
          console.log("[chat] 💼 Searching job title in dictionary:", message);
          const jobTitleResult = await findJobTitle(message.trim());
          
          if (jobTitleResult) {
            console.log("[chat] ✅ Job title found:", jobTitleResult);
            validatedData.jobTitle = jobTitleResult;
          } else {
            console.log("[chat] ⚠️ Job title not found in dictionary, using user input as is");
            // Можем все равно сохранить введенное пользователем значение
            validatedData.jobTitle = message.trim();
          }
        }

        // ВАЛИДАЦИЯ ПРОФЕССИИ
        if (questionContext === "PROFESSION" && message.length >= 3) {
          console.log("[chat] 🎓 Searching profession in dictionary:", message);
          const professionResult = await findProfession(message.trim());
          
          if (professionResult) {
            console.log("[chat] ✅ Profession found:", professionResult);
            validatedData.profession = professionResult;
          } else {
            console.log("[chat] ⚠️ Profession not found in dictionary, using user input as is");
            // Можем все равно сохранить введенное пользователем значение
            validatedData.profession = message.trim();
          }
        }
      } catch (validationError) {
        console.warn("[chat] ❌ Validation error:", validationError);
      }
    }

    // ============================================================
    // 3. ОРГАНИЗАЦИЯ - Поиск через DaData/Минюст РФ
    // ============================================================
    let organizationSearchResult: string | null = null;
    
    // Проверяем, не является ли это подтверждением найденной организации
    const isOrganizationConfirmation = questionContext === "CONFIRMATION" && 
                                       chatHistory.length > 0 &&
                                       chatHistory[chatHistory.length - 1].content.toLowerCase().includes("организаци");
    
    if (
      chatSession.type === "STATEMENT" &&
      questionContext === "ORGANIZATION" &&
      !isOrganizationConfirmation // Не ищем повторно, если это подтверждение
    ) {
      try {
        console.log("[chat] 🏢 Detecting organization search context...");
        
        // Импортируем функции поиска организации
        const { searchOrganizationInDatabase, searchOrganizationInMinjust } = await import("@/lib/organization-search");
        
        // Извлекаем регион из профиля пользователя (если есть)
        const userRegion = user?.preferredDiscountCity;
        
        // Сначала ищем в собственной базе данных
        console.log(`[chat] 🔍 Searching organization in database: ${message}, region: ${userRegion}`);
        const dbResult = await searchOrganizationInDatabase(message, userRegion);
        
        if (dbResult) {
          console.log(`[chat] ✅ Organization found in database: ${dbResult.name}`);
          organizationSearchResult = `[НАЙДЕНА ОРГАНИЗАЦИЯ В БАЗЕ МОЙСОЮЗ: ${dbResult.name}]`;
        } else {
          // Если не найдено в базе, ищем в Минюсте через DaData
          console.log(`[chat] 🔍 Organization not in database, searching in Minjust/DaData...`);
          const minjustResult = await searchOrganizationInMinjust(message, userRegion);
          
          if (minjustResult) {
            console.log(`[chat] ✅ Organization found in Minjust/DaData: ${minjustResult.name}`);
            organizationSearchResult = `[НАЙДЕНА ОРГАНИЗАЦИЯ В РЕЕСТРЕ МИНЮСТА: ${minjustResult.name}]`;
          } else {
            console.log(`[chat] ❌ Organization not found in Minjust/DaData`);
            organizationSearchResult = `[ОРГАНИЗАЦИЯ НЕ НАЙДЕНА В РЕЕСТРАХ]`;
          }
        }
      } catch (orgSearchError) {
        console.error("[chat] ❌ Organization search error:", orgSearchError);
        // Продолжаем работу без поиска организации
      }
    }

    // Улучшаем сообщение пользователя с учетом контекста и валидированных данных
    if (chatSession.type === "STATEMENT" && message) {
      userMessage = enhanceUserMessageWithContext(message, questionContext, validatedData);
      
      // Добавляем результат поиска организации, если он есть
      if (organizationSearchResult) {
        userMessage = `${userMessage}\n\n${organizationSearchResult}`;
      }
    }

    // Проверяем, был ли загружен документ
    // ПРИОРИТЕТ 1: Используем информацию от компонента (uploadedDocumentFromBody)
    // ПРИОРИТЕТ 2: Ищем по тексту сообщения
    let uploadedDocument: { type: string; fileName: string; documentId: string } | null = null;
    
    // Если компонент передал информацию о загруженном документе - используем её
    if (uploadedDocumentFromBody && uploadedDocumentFromBody.documentId) {
      console.log("[chat] 📁 Using uploaded document info from request body:", uploadedDocumentFromBody);
      uploadedDocument = {
        type: uploadedDocumentFromBody.type || "MEMBERSHIP_APPLICATION",
        fileName: uploadedDocumentFromBody.fileName || "документ",
        documentId: uploadedDocumentFromBody.documentId,
      };
    }
    // Иначе ищем по тексту сообщения
    else if (message && (message.toLowerCase().includes("загрузил файл") || message.toLowerCase().includes("загружен файл") || message.toLowerCase().includes("файл:"))) {
      console.log("[chat] 📁 User mentioned file upload, searching for recent documents...");
      
      // Извлекаем имя файла из сообщения для более точного поиска
      const fileNameMatch = message.match(/файл[:\s]+([^\s.]+(?:\.[a-z]+)?)/i);
      const mentionedFileName = fileNameMatch ? fileNameMatch[1] : null;
      console.log("[chat] Mentioned file name:", mentionedFileName);
      
      // Ищем документы пользователя со статусом SIGNED (подписанные)
      const recentDocuments = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: "SIGNED", // Ищем подписанные документы
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 2, // Берём оба документа
      });

      if (recentDocuments.length > 0) {
        // Определяем какой документ упоминается в сообщении
        const isMembershipMentioned = message.toLowerCase().includes("membership") || 
                                      message.toLowerCase().includes("вступлени");
        const isContributionMentioned = message.toLowerCase().includes("contribution") || 
                                        message.toLowerCase().includes("взнос");
        
        // Выбираем документ на основе упоминания или берём последний обновлённый
        let doc = recentDocuments[0];
        if (isMembershipMentioned) {
          const membershipDoc = recentDocuments.find(d => d.type === "MEMBERSHIP_APPLICATION");
          if (membershipDoc) doc = membershipDoc;
        } else if (isContributionMentioned) {
          const contributionDoc = recentDocuments.find(d => d.type === "CONTRIBUTION_APPLICATION");
          if (contributionDoc) doc = contributionDoc;
        }
        
        uploadedDocument = {
          type: doc.type,
          fileName: doc.fileName || doc.title || "документ",
          documentId: doc.id,
        };
        console.log("[chat] ✅ Found uploaded document:", uploadedDocument);
      } else {
        // Если подписанных нет, ищем любые сгенерированные
        const anyDocuments = await prisma.document.findMany({
          where: {
            userId: session.user.id,
            type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
        });
        
        if (anyDocuments.length > 0) {
          const doc = anyDocuments[0];
          uploadedDocument = {
            type: doc.type,
            fileName: doc.fileName || doc.title || "документ",
            documentId: doc.id,
          };
          console.log("[chat] ✅ Found document (any status):", uploadedDocument);
        } else {
          console.log("[chat] ⚠️ No documents found, but user mentioned file upload");
        }
      }
    }

    // Добавляем информацию о загруженном документе в системный промпт, если он есть
    let enhancedSystemPrompt = systemPrompt;
    if (uploadedDocument) {
      const docTypeRu = uploadedDocument.type === 'MEMBERSHIP_APPLICATION' 
        ? 'Заявление о вступлении в профсоюз'
        : uploadedDocument.type === 'CONTRIBUTION_APPLICATION'
        ? 'Заявление о взносах'
        : 'Документ';
      
      // Проверяем какие документы уже загружены пользователем
      const userDocuments = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: "SIGNED", // Только подписанные
        },
      });

      const hasMembershipApp = userDocuments.some(d => d.type === "MEMBERSHIP_APPLICATION");
      const hasContributionApp = userDocuments.some(d => d.type === "CONTRIBUTION_APPLICATION");
      const bothDocumentsUploaded = hasMembershipApp && hasContributionApp;

      let missingDocuments = [];
      if (!hasMembershipApp) missingDocuments.push("Заявление о вступлении в профсоюз");
      if (!hasContributionApp) missingDocuments.push("Заявление о взносах");
      
      enhancedSystemPrompt += `\n\n⚠️⚠️⚠️ ВАЖНО: ПОЛЬЗОВАТЕЛЬ ЗАГРУЗИЛ ДОКУМЕНТ ⚠️⚠️⚠️

[UPLOADED_DOCUMENT]
Пользователь ТОЛЬКО ЧТО загрузил документ:
- Тип: ${docTypeRu}
- Имя файла: ${uploadedDocument.fileName}
- Статус: Проверен и принят системой
- ID документа: ${uploadedDocument.documentId}

[СТАТУС ДОКУМЕНТОВ]
- Заявление о вступлении: ${hasMembershipApp ? '✅ Загружено' : '❌ Не загружено'}
- Заявление о взносах: ${hasContributionApp ? '✅ Загружено' : '❌ Не загружено'}
- Все документы загружены: ${bothDocumentsUploaded ? 'ДА' : 'НЕТ'}

ТЫ ДОЛЖЕН:
1. Подтвердить: "Отлично! Я получил ваше подписанное заявление и проверил его. ${docTypeRu} успешно добавлено в систему."
2. ${bothDocumentsUploaded 
     ? `Сказать: "Все необходимые заявления загружены! Ваши документы отправлены в Профсоюз на проверку. Ожидайте подтверждения от Профкома." Затем предложить: "А пока документы на проверке, давайте я узнаю о вас немного больше для более персонализированного общения. Расскажите, пожалуйста, о себе."`
     : `Сказать: "Осталось загрузить: ${missingDocuments.join(', ')}. Пожалуйста, загрузите оставшиеся документы."`
   }

СЛЕДУЙ ТОЧНО ЭТИМ ИНСТРУКЦИЯМ.`;
    }

    // Если профиль заполнен и нужно показать итог - добавляем извлечённые данные в промпт
    if (chatSession.type === "STATEMENT" && !hasGeneratedDocuments) {
      // Проверяем есть ли в последнем сообщении бота признак сбора данных (последнее подтверждение)
      const lastBotMsg = chatHistory[chatHistory.length - 1];
      const isCollectingProfile = lastBotMsg && lastBotMsg.role === "assistant" && 
                                 (lastBotMsg.content.includes("образование") || 
                                  lastBotMsg.content.includes("профессия") ||
                                  lastBotMsg.content.includes("должность"));
      
      // Экстракт из переписки удален - данные заполняются только через модальное окно анкеты
    }

    // Формируем массив сообщений для OpenRouter
    // ⚠️ ВАЖНО: Ограничиваем историю последними 15 сообщениями, чтобы системный промпт не "выталкивался" из контекста
    const recentHistory = chatHistory.slice(-15);
    
    const messages: ChatMessagePayload[] = [
      {
        role: "system",
        content: enhancedSystemPrompt,
      },
      ...recentHistory.map((msg) => ({
        role: msg.role as ChatMessagePayload["role"],
        content: msg.content,
      })),
      {
        role: "user",
        content: userMessage,
      },
    ];
    
    console.log(`[chat] Отправляем в API: системный промпт + ${recentHistory.length} сообщений из истории + новое сообщение пользователя`);

    // Очищаем технические маркеры из сообщения перед сохранением
    const cleanMessage = message
      .replace(/\[SELF_FILL_COMPLETED\]/g, '')
      .replace(/\[DOCUMENTS_UPLOADED\]/g, '')
      .replace(/\[PROFILE_COMPLETE\]/g, '')
      .trim();

    // Сохраняем сообщение пользователя с привязкой к сессии
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        sessionId: chatSession.id,
        role: "user",
        content: cleanMessage,
        chatBotId: bot.id,
      },
    });

    // Получаем настройки провайдера
    const overrideConfig = resolveProviderOverride(bot);
    const providerName =
      (typeof overrideConfig?.provider === "string" ? overrideConfig.provider : undefined) ||
      bot.apiProvider?.name ||
      "openrouter";

    const providerApiKey =
      (typeof overrideConfig?.apiKey === "string" ? overrideConfig.apiKey : undefined) ||
      bot.apiProvider?.apiKey ||
      "";

    const providerApiBaseUrl =
      (typeof overrideConfig?.apiBaseUrl === "string" ? overrideConfig.apiBaseUrl : undefined) ||
      bot.apiProvider?.apiBaseUrl ||
      "";

    const overrideHeaders =
      overrideConfig && typeof overrideConfig.headers === "object" && !Array.isArray(overrideConfig.headers)
        ? (overrideConfig.headers as Record<string, unknown>)
        : null;

    // Определяем API конфигурацию в зависимости от провайдера бота
    let apiUrl: string | undefined;
    let apiKey: string | undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (overrideHeaders && typeof overrideHeaders === "object") {
      for (const [key, value] of Object.entries(overrideHeaders)) {
        if (typeof value === "string" && value.trim().length > 0) {
          headers[key] = value;
        }
      }
    }

    if (providerName === "openrouter") {
      const openRouterConfig = await getOpenRouterConfig();
      apiKey = providerApiKey || openRouterConfig.apiKey || "";
      apiUrl = providerApiBaseUrl || OPENROUTER_API_URL;
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = process.env.NEXTAUTH_URL || "http://localhost:3004";
      headers["X-Title"] = "MyUnion Pro";
    } else if (providerName === "openai") {
      apiKey = providerApiKey || "";
      apiUrl = providerApiBaseUrl || "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (providerName === "anthropic") {
      apiKey = providerApiKey || "";
      apiUrl = providerApiBaseUrl || "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (providerName === "custom") {
      apiKey = providerApiKey || "";
      apiUrl = providerApiBaseUrl || "";
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    } else if (bot.apiProvider?.apiBaseUrl || providerApiBaseUrl) {
      // Любой другой провайдер из таблицы
      apiKey = providerApiKey || "";
      apiUrl = bot.apiProvider?.apiBaseUrl || providerApiBaseUrl || "";
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    } else {
      // Fallback на OpenRouter
      const openRouterConfig = await getOpenRouterConfig();
      apiKey = openRouterConfig.apiKey || "";
      apiUrl = OPENROUTER_API_URL;
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = process.env.NEXTAUTH_URL || "http://localhost:3004";
      headers["X-Title"] = "MyUnion Pro";
    }

    if (!apiKey || !apiUrl) {
      console.error("[chat] API ключ или URL не настроены");
      return NextResponse.json(
        { error: "AI недоступен. Обратитесь к администратору." },
        { status: 503 },
      );
    }
    
    console.log(`[chat] Конфигурация:`, {
      provider: providerName,
      apiUrl,
      apiKeyPresent: !!apiKey,
      apiKeyPrefix: apiKey?.substring(0, 8) + '...',
      model: bot.model,
      headersKeys: Object.keys(headers),
    });

    // Формируем тело запроса в зависимости от провайдера
    let requestBody: Record<string, unknown>;
    if (providerName === "anthropic") {
      // Anthropic использует другой формат
      requestBody = {
        model: bot.model,
        max_tokens: bot.maxTokens,
        messages: messages.filter((m) => m.role !== "system"),
        system: messages.find((m) => m.role === "system")?.content || "",
      };
    } else {
      // OpenAI/OpenRouter/прочие формат
      requestBody = {
        model: bot.model,
        messages,
        temperature: bot.temperature,
        max_tokens: bot.maxTokens,
      };
    }

    // Отправляем запрос в API
    console.log(`[chat] Отправка запроса к ${providerName}:`, { apiUrl, model: bot.model, messagesCount: messages.length });
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log(`[chat] ${providerName} ответил со статусом:`, response.status, response.statusText);
    
    // Проверяем Content-Type перед парсингом
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const errorText = await response.text();
      console.error(`[chat] ${providerName} вернул не-JSON (${contentType}):`, errorText.substring(0, 500));
      return NextResponse.json(
        { error: `AI сервис вернул некорректный ответ. Проверьте настройки API ключа и модели.` },
        { status: 503 }
      );
    }

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[chat] ${providerName} API error:`, errorData);
      let errorMessage = "Ошибка при обращении к AI";
      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = errorJson.error?.message || errorJson.error || errorMessage;
      } catch {
        // Если не JSON, используем текст ошибки
        if (errorData) {
          errorMessage = errorData.substring(0, 200);
        }
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log(`[chat] ${providerName} успешно ответил`);
    // Обрабатываем разные форматы ответов
    let aiResponse: string;
    if (providerName === "anthropic") {
      aiResponse = data.content?.[0]?.text || data.content || "Извините, не удалось получить ответ.";
    } else {
      aiResponse = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "Извините, не удалось получить ответ.";
    }

    // ОБРАБОТКА САМОСТОЯТЕЛЬНОГО ЗАПОЛНЕНИЯ ПРОФИЛЯ
    // Если пользователь отправил [SELF_FILL_COMPLETED], генерируем документы БЕЗ автоматического ответа
    if (message && message.includes("[SELF_FILL_COMPLETED]")) {
      // Проверяем, что это STATEMENT сессия и документы еще не созданы
      if (chatSession.type === "STATEMENT" && !hasGeneratedDocuments) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { organization: true },
          });

          // Проверяем полноту профиля
          const profileIsComplete = isProfileComplete(user);

          if (profileIsComplete && user) {
            console.log("[chat] 🎯 Self-fill completed with full profile - generating documents...");
            
            // Генерируем PDF файлы
            const [membershipPath, contributionsPath] = await Promise.all([
              generateMembershipApplication(user),
              generateContributionsApplication(user, user.organization?.name, undefined),
            ]);
            
            console.log("[chat] PDF files generated:", { membershipPath, contributionsPath });
            
            // Проверяем существующие документы
            const existingDocs = await prisma.document.findMany({
          where: { 
            userId: session.user.id,
                type: {
                  in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
                },
              },
            });

            // Получаем размеры файлов
            const fs = await import("fs/promises");
            const pathModule = await import("path");
            
            const membershipStats = await fs.stat(pathModule.join(process.cwd(), "public", membershipPath));
            const contributionsStats = await fs.stat(pathModule.join(process.cwd(), "public", contributionsPath));

            // Создаем или обновляем документы в базе данных
            // Заявление о вступлении
            const existingMembership = existingDocs.find(d => d.type === "MEMBERSHIP_APPLICATION");
            if (existingMembership) {
              await prisma.document.update({
                where: { id: existingMembership.id },
                data: {
                  filePath: membershipPath,
                  fileName: pathModule.basename(membershipPath),
                  fileSize: membershipStats.size,
                  status: "GENERATED",
                  // Сбрасываем старые подписанные документы и Google Drive
                  signedFilePath: null,
                  driveFileId: null,
                  driveUrl: null,
                },
              });
              console.log("[chat] ✅ Membership application updated in DB (old signed version cleared)");
            } else {
              await prisma.document.create({
                data: {
                  userId: session.user.id,
                  type: "MEMBERSHIP_APPLICATION",
                  status: "GENERATED",
                  title: "Заявление о вступлении в профсоюз",
                  filePath: membershipPath,
                  fileName: pathModule.basename(membershipPath),
                  fileSize: membershipStats.size,
                  mimeType: "application/pdf",
                  organizationId: user.organizationId || null,
                },
              });
              console.log("[chat] ✅ Membership application created in DB");
            }

            // Заявление о взносах
            const existingContributions = existingDocs.find(d => d.type === "CONTRIBUTION_APPLICATION");
            if (existingContributions) {
              await prisma.document.update({
                where: { id: existingContributions.id },
                data: {
                  filePath: contributionsPath,
                  fileName: pathModule.basename(contributionsPath),
                  fileSize: contributionsStats.size,
                  status: "GENERATED",
                  // Сбрасываем старые подписанные документы и Google Drive
                  signedFilePath: null,
                  driveFileId: null,
                  driveUrl: null,
                },
              });
              console.log("[chat] ✅ Contributions application updated in DB (old signed version cleared)");
            } else {
              await prisma.document.create({
                data: {
                  userId: session.user.id,
                  type: "CONTRIBUTION_APPLICATION",
                  status: "GENERATED",
                  title: "Заявление о взносах",
                  filePath: contributionsPath,
                  fileName: pathModule.basename(contributionsPath),
                  fileSize: contributionsStats.size,
                  mimeType: "application/pdf",
                  organizationId: user.organizationId || null,
                },
              });
              console.log("[chat] ✅ Contributions application created in DB");
            }
            
            console.log("[chat] ✅ Documents generated and saved to database successfully");
            
            // Отправляем системное сообщение о генерации документов
            try {
              const generatedDocs = await prisma.document.findMany({
                where: {
                  userId: session.user.id,
                  type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
                  status: "GENERATED",
                },
                select: { type: true, title: true, filePath: true },
              });

              await SystemMessages.documentsGenerated(session.user.id, generatedDocs);
              await SystemMessages.uploadDocumentsInstruction(session.user.id);
              console.log("[chat] ✅ System messages sent: documents generated");
            } catch (sysMsgError) {
              console.error("[chat] Error sending system messages:", sysMsgError);
              // Не блокируем генерацию документов из-за ошибки отправки сообщений
            }
            
            // Отвечаем с инструкцией по скачиванию и загрузке документов
            aiResponse = `Отлично! 🎉 Ваша анкета успешно заполнена, и документы для вступления в профсоюз сгенерированы.

**Следующие шаги:**

1. 📥 **Скачайте документы** из модального окна (Шаг 3)
   - Заявление о вступлении в профсоюз
   - Заявление о перечислении членских взносов
   - Устав Профсоюза (для ознакомления)

2. 🖨️ **Распечатайте** заявления

3. ✍️ **Подпишите** документы и поставьте дату

4. 📤 **Загрузите** обратно подписанные документы через форму

[SHOW_DOCUMENT_ACTIONS]

После отправки документов на проверку, я расскажу вам о всех возможностях платформы! 😊`;
                } else {
            console.log("[chat] ⚠️ Self-fill completed but profile incomplete");
            aiResponse = `⚠️ Для генерации заявлений необходимо заполнить все обязательные поля профиля. Пожалуйста, проверьте и дополните данные.`;
          }
        } catch (docError) {
          console.error("[chat] ⚠️ Error generating documents after self-fill:", docError);
          aiResponse = `⚠️ Произошла ошибка при генерации документов. Пожалуйста, обратитесь в поддержку или попробуйте позже.`;
        }
      } else {
        // Документы уже были сгенерированы
        aiResponse = `Документы уже были сгенерированы. Пожалуйста, скачайте их из модального окна, подпишите и загрузите обратно.`;
      }
    }

    // ОБРАБОТКА ЗАГРУЗКИ ДОКУМЕНТОВ
    // Если пользователь отправил [DOCUMENTS_UPLOADED], отправляем системное сообщение
    if (message && message.includes("[DOCUMENTS_UPLOADED]")) {
      // Проверяем что документы действительно загружены
      const uploadedDocs = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
          status: { in: ["SIGNED", "PENDING", "APPROVED"] },
          signedFilePath: { not: null },
        },
      });

      if (uploadedDocs.length >= 2) {
        // Отправляем системное сообщение
        try {
          await SystemMessages.documentsSubmitted(session.user.id);
          console.log("[chat] ✅ System message sent: documents submitted");
        } catch (sysMsgError) {
          console.error("[chat] Error sending system message:", sysMsgError);
        }
      }

      aiResponse = `Превосходно! 🎉 Ваши документы получены и отправлены на проверку.

**Что происходит дальше?**

⏳ Проверка ваших заявлений обычно занимает **1-2 рабочих дня**. Мы уведомим вас, когда документы будут одобрены.

А пока что давайте расскажу, какие **возможности** открываются для вас как члена профсоюза! 😊

---

## 🎁 Эксклюзивные скидки BestBenefits

Вы получаете **бесплатный доступ** к платформе скидок:

✨ **Что доступно:**
- 🏪 **Более 1000 партнеров** по всей России
- 💰 **Скидки до 70%** на товары и услуги  
- 🛒 Магазины, рестораны, развлечения, здоровье, путешествия
- 📱 **Apple Wallet интеграция** - добавьте карту на смартфон
- 🎫 **Генерация промокодов** прямо из приложения

🔗 Перейдите в раздел [Скидки](/dashboard/discounts) чтобы начать экономить!

---

## 🤝 Поддержка и консультации

**Я всегда готов помочь вам:**
- 📚 Расскажу о ваших **правах и льготах** как члена профсоюза
- ⚖️ Помогу разобраться с **трудовыми спорами**
- 📝 Окажу поддержку в **обращениях и жалобах**
- 💡 Отвечу на любые вопросы о профсоюзе

---

**Есть вопросы? Спрашивайте!** 💬 

Я могу рассказать подробнее про скидки, помочь с документами или ответить на любые другие вопросы.`;
    }

    // Проверяем полноту профиля и добавляем маркер завершения если нужно
    // Только для STATEMENT сессий
    if (chatSession.type === "STATEMENT") {
      try {
        const allMessages = await prisma.chatMessage.findMany({
          where: { 
            userId: session.user.id,
            sessionId: chatSession.id,
          },
          orderBy: { createdAt: "asc" },
        });

        // Проверяем, есть ли уже маркеры
        const hasCompleteMarker = allMessages.some(
          msg => msg.role === "assistant" && msg.content.includes("[PROFILE_COMPLETE]")
        );
        const hasAwaitingConfirmationMarker = allMessages.some(
          msg => msg.role === "assistant" && msg.content.includes("[PROFILE_AWAITING_CONFIRMATION]")
        );

        // Экстракт из переписки удален - данные заполняются только через модальное окно анкеты

        // Проверяем полноту профиля ТОЛЬКО если документы еще не сгенерированы
        if (!hasGeneratedDocuments) {
        // Теперь проверяем полноту профиля
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
        });

        // Проверяем, заполнены ли все необходимые поля профиля
        const profileIsComplete = isProfileComplete(user);

        console.log("[chat] Profile completeness check:", {
          firstName: !!user?.firstName,
          lastName: !!user?.lastName,
          dateOfBirth: !!user?.dateOfBirth,
          phone: !!user?.phone,
          address: !!user?.address,
          jobTitle: !!user?.jobTitle,
          profession: !!user?.profession,
          education: !!user?.education,
          isComplete: profileIsComplete,
        });

        // Проверяем, подтвердил ли пользователь данные
        const userConfirmed = message && (
          /^(да|yes|верно|правильно|всё\s*верно|все\s*верно|подтверждаю|согласен)$/i.test(message.trim()) ||
          /^(да[,.!]?|yes[,.!]?|верно[,.!]?|правильно[,.!]?)$/i.test(message.trim())
        );

        // Если профиль заполнен, НО пользователь еще не подтвердил данные
        if (!hasCompleteMarker && !hasAwaitingConfirmationMarker && profileIsComplete) {
          console.log("[chat] ✅ Profile is COMPLETE! Waiting for user confirmation. Adding [PROFILE_AWAITING_CONFIRMATION] marker");
          aiResponse += "\n\n[PROFILE_AWAITING_CONFIRMATION]";
        }
        
        // Если пользователь подтвердил данные → генерируем документы
        if (hasAwaitingConfirmationMarker && !hasCompleteMarker && userConfirmed) {
          console.log("[chat] ✅ User CONFIRMED data! Generating documents and adding [PROFILE_COMPLETE] marker");
          aiResponse += "\n\n[PROFILE_COMPLETE]";
          
          // Генерируем документы
          try {
            console.log("[chat] 📄 Generating documents...");
            const userOrg = await prisma.user.findUnique({
              where: { id: session.user.id },
              include: { organization: true },
            });
            
            if (userOrg) {
              // Генерируем PDF файлы
              const [membershipPath, contributionsPath] = await Promise.all([
                generateMembershipApplication(userOrg),
                generateContributionsApplication(userOrg, userOrg.organization?.name, undefined),
              ]);
              
              console.log("[chat] PDF files generated:", { membershipPath, contributionsPath });
              
              // Проверяем существующие документы
              const existingDocs = await prisma.document.findMany({
                where: {
                  userId: session.user.id,
                  type: {
                    in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
                  },
                },
              });

              // Получаем размеры файлов
              const fs = await import("fs/promises");
              const pathModule = await import("path");
              
              const membershipStats = await fs.stat(pathModule.join(process.cwd(), "public", membershipPath));
              const contributionsStats = await fs.stat(pathModule.join(process.cwd(), "public", contributionsPath));

              // Создаем или обновляем документы в базе данных
              const ppoChairman = userOrg.organization?.chairmanName || "Председатель ППО";
              
              // Заявление о вступлении
              const existingMembership = existingDocs.find(d => d.type === "MEMBERSHIP_APPLICATION");
              if (existingMembership) {
                await prisma.document.update({
                  where: { id: existingMembership.id },
                  data: {
                    filePath: membershipPath,
                    fileName: pathModule.basename(membershipPath),
                    fileSize: membershipStats.size,
                    status: "GENERATED",
                  },
                });
                console.log("[chat] ✅ Membership application updated in DB");
              } else {
                await prisma.document.create({
                  data: {
                    userId: session.user.id,
                    type: "MEMBERSHIP_APPLICATION",
                    status: "GENERATED",
                    title: "Заявление о вступлении в профсоюз",
                    filePath: membershipPath,
                    fileName: pathModule.basename(membershipPath),
                    fileSize: membershipStats.size,
                    mimeType: "application/pdf",
                    organizationId: userOrg.organizationId || null,
                  },
                });
                console.log("[chat] ✅ Membership application created in DB");
              }

              // Заявление о взносах
              const existingContributions = existingDocs.find(d => d.type === "CONTRIBUTION_APPLICATION");
              if (existingContributions) {
                await prisma.document.update({
                  where: { id: existingContributions.id },
                  data: {
                    filePath: contributionsPath,
                    fileName: pathModule.basename(contributionsPath),
                    fileSize: contributionsStats.size,
                    status: "GENERATED",
                  },
                });
                console.log("[chat] ✅ Contributions application updated in DB");
              } else {
                await prisma.document.create({
                  data: {
                    userId: session.user.id,
                    type: "CONTRIBUTION_APPLICATION",
                    status: "GENERATED",
                    title: "Заявление о взносах",
                    filePath: contributionsPath,
                    fileName: pathModule.basename(contributionsPath),
                    fileSize: contributionsStats.size,
                    mimeType: "application/pdf",
                    organizationId: userOrg.organizationId || null,
                  },
                });
                console.log("[chat] ✅ Contributions application created in DB");
              }
              
              console.log("[chat] ✅ Documents generated and saved to database successfully");
            }
          } catch (docError) {
            console.error("[chat] ⚠️  Error generating documents:", docError);
            // Don't fail the response if document generation fails
          }
        } else if (hasAwaitingConfirmationMarker && !userConfirmed) {
          console.log("[chat] ⏳ Profile awaiting confirmation from user");
        } else if (!profileIsComplete) {
          console.log("[chat] ❌ Profile still incomplete after extraction");
        } else {
          console.log("[chat] Profile complete marker already exists");
        }
        } else {
          console.log("[chat] ⏭️  Skipping profile check - documents already generated");
        }
      } catch (error) {
        console.error("[chat] Error checking profile completeness:", error);
        // Don't fail the chat if profile check fails
      }
    }

    // ОБРАБОТКА ИСПРАВЛЕНИЙ ПРОФИЛЯ
    // Проверяем есть ли маркер [UPDATE_FIELD: ...] в ответе бота
    const updateFieldPattern = /\[UPDATE_FIELD:\s*(\w+)=([^\]]+)\]/g;
    let updateFieldMatch;
    const fieldsToUpdate: Array<{field: string, value: string}> = [];
    
    while ((updateFieldMatch = updateFieldPattern.exec(aiResponse)) !== null) {
      const field = updateFieldMatch[1];
      const value = updateFieldMatch[2].trim();
      fieldsToUpdate.push({ field, value });
      console.log(`[chat] 🔄 Detected field update request: ${field} = ${value}`);
    }
    
    // Если есть поля для обновления - обновляем их
    if (fieldsToUpdate.length > 0) {
      for (const { field, value } of fieldsToUpdate) {
        try {
          // Валидация и преобразование значения
          let validatedValue: any = value;
          
          if (field === 'dateOfBirth') {
            // Парсим дату
            const datePattern = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/;
            const match = value.match(datePattern);
            if (match) {
              const [, day, month, year] = match;
              validatedValue = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            }
          }
          
          // Проверяем что поле разрешено для обновления
          const allowedFields = [
            'firstName', 'lastName', 'middleName', 'dateOfBirth',
            'phone', 'address', 'region', 'jobTitle', 'profession', 'education'
          ];
          
          if (allowedFields.includes(field)) {
            const updateData: any = {};
            updateData[field] = validatedValue;
            
            await prisma.user.update({
              where: { id: session.user.id },
              data: updateData,
            });
            
            console.log(`[chat] ✅ Field ${field} updated to: ${validatedValue}`);
          }
        } catch (updateError) {
          console.error(`[chat] ⚠️ Error updating field ${field}:`, updateError);
        }
      }
      
      // Удаляем маркеры из ответа перед сохранением
      aiResponse = aiResponse.replace(updateFieldPattern, '').trim();
    }

    // Сохраняем ответ AI с привязкой к сессии
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        sessionId: chatSession.id,
        role: "assistant",
        content: aiResponse,
        chatBotId: bot.id,
        isSystemMessage: false, // Сообщения от AI не системные
      } as any,
    });

    // Send push notification to user with action buttons (only if user is not actively chatting)
    try {
      // Firebase Cloud Messaging push notifications
      try {
        // Get user's FCM subscriptions (only with valid fcmToken)
        const userSubs = await prisma.pushSubscription.findMany({
          where: { 
            userId: session.user.id,
            fcmToken: { not: null },
          },
          select: { fcmToken: true },
        });

        console.log("[chat] Checking FCM subscriptions:", {
          userId: session.user.id,
          subscriptionsCount: userSubs.length,
        });

        if (userSubs.length > 0) {
          // Проверяем настройки пользователя для push уведомлений
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
              pushNotificationsEnabled: true,
              pushSoundEnabled: true,
            },
          });

          console.log("[chat] User push settings:", {
            pushNotificationsEnabled: user?.pushNotificationsEnabled,
            pushSoundEnabled: user?.pushSoundEnabled,
          });

          // Если push уведомления отключены, не отправляем
          if (user && user.pushNotificationsEnabled === false) {
            console.log("[chat] ⚠️ Push notifications disabled for user");
          } else {
            const fcmTokens = userSubs.map((sub) => sub.fcmToken).filter(Boolean);
            
            if (fcmTokens.length > 0) {
              // Import Firebase Admin dynamically
              const { messaging } = await import("@/lib/firebase-admin");
              
              const messagePreview = aiResponse.substring(0, 150) + (aiResponse.length > 150 ? "..." : "");
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
              
              // Send notification to all user's devices
              const message = {
                notification: {
                  title: bot.name || "AI Помощник",
                  body: messagePreview,
                },
                data: {
                  type: "chat_message",
                  chatBotId: bot.id,
                  sessionId: chatSession.id,
                  url: `${baseUrl}/dashboard?session=${chatSession.id}`,
                  title: bot.name || "AI Помощник",
                  body: messagePreview,
                  icon: `${baseUrl}/icon.png`,
                  soundEnabled: user?.pushSoundEnabled !== false ? "true" : "false",
                  sound: user?.pushSoundEnabled !== false ? `${baseUrl}/notification-sound.mp3` : undefined,
                },
                webpush: {
                  notification: {
                    title: bot.name || "AI Помощник",
                    body: messagePreview,
                    icon: `${baseUrl}/icon.png`,
                    badge: `${baseUrl}/icon.png`,
                    requireInteraction: false,
                    ...(user?.pushSoundEnabled !== false && {
                      sound: `${baseUrl}/notification-sound.mp3`,
                    }),
                  },
                  fcmOptions: {
                    link: `${baseUrl}/dashboard?session=${chatSession.id}`,
                  },
                },
                android: {
                  priority: "high" as const,
                  notification: {
                    sound: user?.pushSoundEnabled !== false ? "default" : undefined,
                  },
                },
                apns: {
                  payload: {
                    aps: {
                      sound: user?.pushSoundEnabled !== false ? "default" : undefined,
                    },
                  },
                },
                tokens: fcmTokens,
              };

              console.log("[chat] 📢 Sending FCM notification:", {
                recipients: fcmTokens.length,
                soundEnabled: user?.pushSoundEnabled !== false,
              });

              // Send to all tokens
              const response = await messaging.sendEachForMulticast(message);
              
              console.log("[chat] ✅ FCM notification sent:", {
                successCount: response.successCount,
                failureCount: response.failureCount,
                responses: response.responses.map((r, i) => ({
                  success: r.success,
                  messageId: r.messageId,
                  error: r.error?.code,
                })),
              });

              // Log failures
              if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                  if (!resp.success) {
                    console.error(`[chat] ❌ FCM failed for token ${idx}:`, resp.error);
                  }
                });
              }
            }
          }
        } else {
          console.log("[chat] ℹ️ No FCM subscriptions found for user");
        }
      } catch (error) {
        console.error("[chat] ❌ FCM notification error:", error);
        // Don't fail the chat response if push fails
      }
    } catch (pushError) {
      console.warn("[chat] ⚠️ Push notification error:", pushError);
      // Don't fail the chat if push fails
    }

    return NextResponse.json({
      message: aiResponse,
      sessionId: chatSession.id,
      sessionType: chatSession.type,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    
    // Log critical error
    await Logger.critical(
      "api/chat/POST",
      errorMessage,
      error,
      {
        userMessage: message?.substring(0, 100),
        sessionExists: !!session,
      },
      session?.user?.id
    );
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : "") : undefined
      },
      { status: 500 }
    );
  }
}

// GET - получение истории сообщений
export async function GET() {
  console.log("GET /api/chat: Получен запрос");
  try {
    console.log("GET /api/chat: Попытка получить сессию...");
    const session = await getServerSession(authOptions);
    console.log("GET /api/chat: Сессия получена:", session ? `для пользователя ${session.user?.id}` : "сессия отсутствует");

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    
    // Ищем последнюю активную сессию заявления (STATEMENT) с сообщениями
    // Сначала ищем сессии с сообщениями, отсортированные по updatedAt
    // Находим последнюю сессию STATEMENT (ВСЕГДА используем существующую)
    let chatSession = await prisma.chatSession.findFirst({
      where: {
        userId: session.user.id,
        type: "STATEMENT",
      },
      orderBy: {
        updatedAt: "desc", // Берем самую недавно обновленную
      },
    });

    // Создаем новую сессию ТОЛЬКО если у пользователя вообще нет сессий STATEMENT
    if (!chatSession) {
      console.log("GET /api/chat: Сессии STATEMENT нет, создаем первую...");
      chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: "Заявление",
          type: "STATEMENT",
        },
      });
      console.log(`GET /api/chat: 🆕 Создана первая сессия STATEMENT: ${chatSession.id}`);
    } else {
      console.log(`GET /api/chat: ✅ Используем существующую сессию STATEMENT: ${chatSession.id}`);
    }
    
    console.log(`GET /api/chat: Поиск сообщений для сессии ${chatSession.id}...`);
    let messages = await prisma.chatMessage.findMany({
      where: { 
        userId: session.user.id,
        sessionId: chatSession.id,
      },
      orderBy: { createdAt: "asc" },
    });
    console.log(`GET /api/chat: Найдено ${messages.length} сообщений в сессии.`);

    // Если в сессии нет сообщений, но есть старые сообщения без sessionId, привязываем их к сессии
    if (messages.length === 0) {
      console.log("GET /api/chat: Сообщений в сессии нет, проверяем старые сообщения без sessionId...");
      const oldMessages = await prisma.chatMessage.findMany({
        where: {
          userId: session.user.id,
          sessionId: null,
        },
        orderBy: { createdAt: "asc" },
        take: 100, // Берем последние 100 сообщений
      });
      
      if (oldMessages.length > 0) {
        console.log(`GET /api/chat: Найдено ${oldMessages.length} старых сообщений без sessionId, привязываем к сессии...`);
        // Привязываем старые сообщения к сессии
        await prisma.chatMessage.updateMany({
          where: {
            id: { in: oldMessages.map(m => m.id) },
          },
          data: {
            sessionId: chatSession.id,
          },
        });
        messages = oldMessages;
        console.log(`GET /api/chat: Привязано ${messages.length} сообщений к сессии.`);
      }
    }

    if (messages.length === 0) {
      console.log("GET /api/chat: Сообщений нет, создаем приветствие.");
      
      // Выбираем бота в зависимости от типа сессии
      let bot = null;
      if (chatSession.type === "APPEAL") {
        console.log("GET /api/chat: Поиск Appeal Bot...");
        bot = await getAppealBot();
        if (!bot) {
          console.log("GET /api/chat: Appeal Bot не найден, используем default bot как fallback");
          bot = await getDefaultBot();
        } else {
          console.log(`GET /api/chat: Appeal Bot найден: ${bot.name}`);
        }
      } else {
        console.log("GET /api/chat: Поиск бота по умолчанию...");
        bot = await getDefaultBot();
        console.log(`GET /api/chat: Бот по умолчанию найден: ${bot?.name || 'не найден'}`);
      }
      
      if (!bot) {
        console.error("GET /api/chat: Критическая ошибка - бот не найден!");
        throw new Error("Бот не сконфигурирован в базе данных.");
      }
      
      // Приветствие зависит от типа сессии
      const welcomeMessageContent = chatSession.type === "APPEAL"
        ? "Здравствуйте! Я ваш помощник по обращениям в профсоюз. Я могу помочь вам с вопросами и проблемами, связанными с профсоюзом, трудовыми отношениями и правами работников. При ответах я опираюсь на законы Российской Федерации, устав и положения профсоюза. Опишите, пожалуйста, ваше обращение или вопрос, и я постараюсь вам помочь."
        : `Здравствуйте! 👋 Я AI-помощник профсоюза МООП РЗ.

Я готов ответить на ваши вопросы о профсоюзе, скидках BestBenefits, правах членов профсоюза и многом другом.

Если вы ещё не член профсоюза - заполните анкету для подачи заявления о вступлении.

[SHOW_SELF_FILL_BUTTON]`;
      
      console.log("GET /api/chat: Создание приветственного сообщения в БД...");
      
      // Защита от race condition: проверяем еще раз перед созданием
      const doubleCheck = await prisma.chatMessage.findFirst({
        where: { sessionId: chatSession.id },
      });
      
      if (doubleCheck) {
        console.log("GET /api/chat: Приветствие уже создано другим запросом, возвращаем существующее");
        return NextResponse.json({ 
          session: {
            id: chatSession.id,
            title: chatSession.title,
            type: chatSession.type,
          },
          messages: [{
            id: doubleCheck.id,
            role: doubleCheck.role,
            content: doubleCheck.content,
            createdAt: doubleCheck.createdAt,
            isSystemMessage: (doubleCheck as any).isSystemMessage || false,
          }]
        });
      }
      
      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          sessionId: chatSession.id,
          chatBotId: bot.id,
          isSystemMessage: false,
        } as any, // Временное решение до обновления Prisma типов
      });
      console.log("GET /api/chat: Приветственное сообщение создано. ID:", welcomeMessage.id);
      return NextResponse.json({ 
        session: {
          id: chatSession.id,
          title: chatSession.title,
          type: chatSession.type,
        },
        messages: [{
          id: welcomeMessage.id,
          role: welcomeMessage.role,
          content: welcomeMessage.content,
          createdAt: welcomeMessage.createdAt,
          isSystemMessage: (welcomeMessage as any).isSystemMessage || false,
        }]
      });
    }

    console.log("GET /api/chat: Возвращаем историю сообщений.");
    return NextResponse.json({ 
      session: {
        id: chatSession.id,
        title: chatSession.title,
        type: chatSession.type,
      },
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        isSystemMessage: (msg as any).isSystemMessage || false,
      }))
    });
    
  } catch (error) {
    console.error("!!! GET /api/chat КРИТИЧЕСКАЯ ОШИБКА:", error);
    // ВРЕМЕННО: возвращаем детали ошибки для отладки
    return NextResponse.json(
      { 
        error: "Внутренняя ошибка сервера",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

