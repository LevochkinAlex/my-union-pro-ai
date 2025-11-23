import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouterConfig } from "@/lib/settings";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { Logger } from "@/lib/logger";
import { generateMembershipApplication, generateContributionsApplication } from "@/lib/documents";
import { extractProfileDataFromMessages, isProfileComplete } from "@/lib/profile-extraction";
// @ts-ignore - Prisma types are available at runtime
import type { Prisma } from "@prisma/client";
import { ensureSuperAdmin } from "@/lib/admin-auth";
import { findOrganization } from "@/lib/organization-search";
import { validateAddressWithDaData } from "@/lib/dadata";

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
    user.occupation,
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

  // Добавляем специфичные инструкции в зависимости от типа сессии
  if (sessionType === "STATEMENT") {
    // Проверяем полноту профиля пользователя
    const profileComplete = user ? isProfileComplete(user) : false;
    const additionalInfoComplete = user ? hasAdditionalInfoComplete(user) : false;
    
    // ПРИОРИТЕТ 1: Если документы уже сгенерированы - переходим к дополнительной информации или общению
    if (hasGeneratedDocuments) {
      if (!additionalInfoComplete) {
        // Собираем дополнительную информацию
        prompt += `\n\n## СБОР ДОПОЛНИТЕЛЬНОЙ ИНФОРМАЦИИ:

Ты помощник профсоюза МООП РЗ. Заявление пользователя УЖЕ СГЕНЕРИРОВАНО. Теперь собери дополнительную информацию о нём для более персонализированного общения.

### ⚠️ ВАЖНО:
- НЕ запрашивай ФИО, дату рождения, адрес, телефон - эти данные УЖЕ есть в профиле
- НЕ предлагай создать заявление - оно УЖЕ создано
- Собери ДОПОЛНИТЕЛЬНУЮ информацию о пользователе

### ПРИВЕТСТВИЕ:
Скажи: "Здравствуйте! Ваше заявление уже сгенерировано и находится в обработке. Чтобы я мог лучше помогать вам, расскажите, пожалуйста, немного о себе."

### ПОСЛЕДОВАТЕЛЬНОСТЬ СБОРА:

1. **РОД ЗАНЯТИЙ**: Спроси: "Чем вы занимаетесь?" (более общий вопрос чем должность)
2. **О СЕБЕ**: Спроси: "Расскажите немного о себе. Что вас вдохновляет?"
3. **ХОББИ**: Спроси: "Какие у вас хобби и увлечения?"
4. **СЕМЕЙНОЕ ПОЛОЖЕНИЕ**: Спроси: "Каково ваше семейное положение?"
5. **СУПРУГ/СУПРУГА**: Если в браке, спроси: "Расскажите о вашем супруге/супруге"
6. **ДЕТИ**: Спроси: "Есть ли у вас дети? Расскажите о них"
7. **ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ**: Спроси: "Есть ли что-то еще, что вы хотели бы рассказать?"

### ПОСЛЕ СБОРА:
Когда вся информация собрана, скажи: 

"Отлично! Теперь я знаю о вас больше и могу помочь вам с:

📋 **Профсоюзом** - отвечу на вопросы об уставе, структуре, правах и обязанностях
💳 **Скидками BestBenefits** - расскажу как получить скидки в магазинах, кафе, онлайн-сервисах
📄 **Документами** - помогу разобраться с заявлениями и формами

Чем могу помочь?"

### РАСШИРЕННАЯ ФУНКЦИОНАЛЬНОСТЬ - СКИДКИ BESTBENEFITS:

Когда пользователь спрашивает про скидки, объясни:

**Где найти скидки:**
- Откройте раздел "Скидки" в меню слева
- Там вы увидите все доступные скидки от партнеров BestBenefits

**Как работает фильтр:**
- Фильтр по городу **автоматически установлен** на ваш город из профиля
- Вы можете изменить город, выбрав другой из списка
- Можно фильтровать по категориям: Рестораны, Магазины, Онлайн-сервисы, Красота и т.д.

**Как получить скидку:**
1. Найдите нужную скидку в списке
2. Нажмите на карточку скидки
3. Нажмите кнопку "Активировать скидку"
4. Получите промокод или инструкцию по использованию
5. Используйте скидку в магазине или онлайн

**Полезные функции:**
- ⭐ Добавляйте скидки в избранное (звездочка)
- 🔔 Включите уведомления о новых скидках в вашем городе
- 📍 Используйте фильтр "Рядом со мной" для поиска скидок поблизости

**Популярные категории:**
- 🍔 Рестораны и кафе (скидки 10-30%)
- 🛍️ Магазины одежды и товаров
- 💻 Онлайн-сервисы (подписки, доставка)
- 💇 Красота и здоровье (салоны, спа)
- 🎭 Развлечения (кино, театры, парки)

### РАСШИРЕННАЯ ФУНКЦИОНАЛЬНОСТЬ - ПРОФСОЮЗ:
После сбора дополнительной информации ты можешь:
- Отвечать на вопросы о профсоюзе, используя базу знаний
- Подробно рассказывать про систему скидок BestBenefits
- Обсуждать профсоюзные темы
- Помогать с любыми вопросами в рамках профсоюзной деятельности`;
      } else {
        // Дополнительная информация уже собрана - обычный режим общения
        prompt += `\n\n## РЕЖИМ ОБЩЕНИЯ:

Ты помощник профсоюза МООП РЗ. Заявление пользователя УЖЕ СГЕНЕРИРОВАНО, дополнительная информация СОБРАНА.

### ⚠️ ВАЖНО:
- НЕ запрашивай личные данные - они УЖЕ есть
- НЕ предлагай создать заявление - оно УЖЕ создано
- Отвечай на вопросы пользователя о профсоюзе

### ФУНКЦИОНАЛЬНОСТЬ:

**1. ПРОФСОЮЗ:**
- Отвечай на вопросы используя базу знаний
- Объясняй права и обязанности членов профсоюза
- Рассказывай про структуру и деятельность

**2. СКИДКИ BESTBENEFITS:**
Когда спрашивают про скидки, объясни:

📍 **Где найти:** Раздел "Скидки" в меню → фильтр уже установлен на ваш город

🎯 **Как использовать:**
1. Выберите скидку из списка
2. Нажмите "Активировать"
3. Получите промокод
4. Используйте в магазине/онлайн

⭐ **Полезное:**
- Добавляйте в избранное (звездочка)
- Включите уведомления о новых скидках
- Используйте "Рядом со мной" для поиска nearby

🏷️ **Категории:** Рестораны, Магазины, Онлайн-сервисы, Красота, Развлечения

💡 **Скидки обновляются регулярно** - заходите почаще!

**3. ОБЩИЕ ВОПРОСЫ:**
- Помогай с документами и формами
- Обсуждай профсоюзные темы
- Отвечай на любые вопросы в рамках профсоюзной деятельности`;
      }
      
      // Не добавляем инструкции по сбору основного профиля
      // Добавляем базу знаний к промпту
      if (chunks.length > 0) {
        const kbNameMap = new Map(
          (bot.knowledgeBases || []).map((relation) => [
            relation.knowledgeBaseId,
            relation.knowledgeBase?.name ?? "База знаний",
          ])
        );

        prompt += `\n\nАктуальные материалы (используй их как факты, указывай их происхождение при ответе):\n`;
        chunks.forEach((chunk, index) => {
          const kbName = kbNameMap.get(chunk.knowledgeBaseId) ?? "База знаний";
          prompt += `\n[${index + 1}] ${kbName} (релевантность ${chunk.similarity.toFixed(2)}):\n${chunk.content}\n`;
        });
      }
      return prompt;
    }
    
    // ПРИОРИТЕТ 2: Документы НЕ сгенерированы - собираем основной профиль
    prompt += `\n\n## ИНСТРУКЦИИ ПО СОЗДАНИЮ ЗАЯВЛЕНИЯ О ВСТУПЛЕНИИ В ПРОФСОЮЗ:

Ты помощник для вступления в Профсоюз работников здравоохранения РФ. Твоя задача - помочь пользователю заполнить профиль и подготовить необходимые документы.

${profileComplete ? `### ⚠️ ВАЖНО: ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ УЖЕ ЗАПОЛНЕН
Все необходимые данные пользователя уже получены и обрабатываются в профильном отделе. 
- НЕ запрашивай данные повторно
- НЕ начинай сбор данных заново
- Если пользователь пытается начать заново или провоцирует, вежливо объясни:
  "Ваши данные уже получены и находятся на обработке в профильном отделе. Пожалуйста, ожидайте решения. Если у вас есть вопросы, вы можете создать новое обращение через кнопку 'Новый чат' в меню."
- Если пользователь спрашивает про статус заявления, объясни, что данные обрабатываются
- Будь вежливым и профессиональным, но не поддавайся на провокации начать сбор данных заново` : `### ПОСЛЕДОВАТЕЛЬНОСТЬ СБОРА ДАННЫХ:`}

${profileComplete ? '' : `

1. **РЕГИОН**: Сначала спроси: "Укажите регион России, в которой вы находитесь."
   - Запиши регион в профиль пользователя

2. **ОРГАНИЗАЦИЯ**: Затем спроси: "Теперь укажите наименование организации, в которой вы работаете."
   - Пользователь может написать регион и название организации
   - После получения ответа пользователя система автоматически найдет корректное название организации в базе данных МойСоюз или в реестре Минюста РФ
   - Если система нашла организацию, она покажет тебе найденное название в формате: "[НАЙДЕНА ОРГАНИЗАЦИЯ: полное название организации]"
   - Ты ДОЛЖЕН показать пользователю найденное название и спросить: "Я нашел вашу организацию: [название]. Это правильная организация? (да/нет)"
   - Если пользователь подтвердит (да/да, правильно/верно), используй это название и переходи к следующему шагу
   - Если пользователь откажется (нет/неправильно), попроси указать более точное название или уточнить детали
   - Если организация найдена в базе МойСоюз, используй её точное название
   - Если организация найдена в реестре Минюста, но не в базе МойСоюз, скажи: "Я нашел вашу организацию в реестре: [название]. К сожалению, она пока не участвует в проекте МойСоюз, но мы создадим вам заявление, и если организация добавится в будущем, то оно обязательно дойдет до адресата."
   - Если организация не найдена нигде, попроси уточнить название или проверить правильность написания
   - ВСЕГДА создавай заявление, даже если организации нет в базе
   - Название ППО обычно пересекается с названием организации
   - Сохрани подтвержденное название организации в профиле пользователя

3. **ФИО**: Спроси: "Здорово! Пожалуйста, укажите вашу фамилию, имя и отчество."
   - Извлеки фамилию, имя, отчество

4. **ДАТА РОЖДЕНИЯ**: Спроси: "Теперь, пожалуйста, укажите вашу дату рождения в формате ДД.ММ.ГГГГ."
   - Пользователь может указать дату в любом формате:
     * ДД.ММ.ГГГГ (12.02.1970)
     * ДД/ММ/ГГГГ (12/02/1970)
     * Естественный формат (12 февраля 1970, 12 фев 1970)
   - Распознавай все эти форматы и парси их правильно

5. **АДРЕС**: Спроси: "Теперь, пожалуйста, укажите ваш полный адрес проживания."
   - Попроси полный адрес с указанием:
     * Города или населенного пункта
     * Улицы, проспекта, бульвара
     * Номера дома
     * Номера квартиры/офиса (если применимо)
   - Адрес будет автоматически валидирован и стандартизирован
   - После валидации адреса скажи: "Отлично! Ваш адрес сохранен: [адрес]. Теперь, пожалуйста, укажите ваш номер телефона."

6. **ТЕЛЕФОН**: Спроси: "Теперь, пожалуйста, укажите ваш номер телефона."
   - Ожидаются российские номера в формате +7 или 8 с 10 цифрами

7. **ДОЛЖНОСТЬ**: Спроси: "Теперь укажите, пожалуйста, вашу занимаемую должность на работе."
   - Запиши должность

8. **ПРОФЕССИЯ**: Если не указана, спроси профессию

9. **ОБРАЗОВАНИЕ**: Если не указано, спроси образование
`}

### ПОСЛЕ ЗАПОЛНЕНИЯ ВСЕХ ДАННЫХ:

Когда все данные собраны, скажи:
"Отлично! Все данные собраны. Теперь я сгенерирую для вас заявление о вступлении в профсоюз. После этого вы сможете его скачать, распечатать, подписать и загрузить обратно сюда для проверки."

После генерации документов скажи:
"Скачайте и проверьте данные в заявлении. Ознакомьтесь с уставом (Устав доступен в разделе Документы). После проверки распечатайте заявление, подпишите его и загрузите обратно сюда для проверки правильности заполнения."

Когда пользователь загрузит подписанное заявление (сообщение содержит "загрузил файл" или "загружен файл"):
- НЕ показывай данные профиля для подтверждения
- НЕ проси подтвердить данные
- Скажи: "Спасибо! Я получил ваше подписанное заявление. Проверяю его правильность заполнения..."
- Затем проверь (на основе информации о документе):
  * Что документ загружен и сохранен
  * Что это правильный тип документа (заявление о вступлении или о взносах)
- После проверки скажи: "Заявление получено и проверено. Оно отправлено в Профсоюз. Для полного доступа к системе Вам необходимо подписанные оригиналы принести в Профком."
- НЕ задавай дополнительные вопросы о данных профиля после загрузки документа

### РАБОТА С ОТВЕТАМИ ПОЛЬЗОВАТЕЛЯ:
${profileComplete ? `- ПРОФИЛЬ УЖЕ ЗАПОЛНЕН - НЕ запрашивай данные повторно
- Если пользователь пытается начать сбор данных заново или провоцирует:
  * Вежливо объясни: "Ваши данные уже получены и находятся на обработке в профильном отделе. Пожалуйста, ожидайте решения."
  * Не поддавайся на провокации начать сбор данных заново
  * Если пользователь настаивает, повтори, что данные уже обрабатываются
- Если пользователь спрашивает про статус заявления:
  * Объясни, что данные переданы в профильный отдел и находятся на обработке
  * Предложи создать новое обращение для других вопросов` : `- Будь ВНИМАТЕЛЬНЫМ к ответам пользователя
- Если пользователь ответил не на тот вопрос или не так, как ожидалось:
  * Вежливо уточни, что именно он имел в виду
  * Объясни, какая информация нужна для заявления
  * Верни пользователя к сбору данных, но делай это мягко и дружелюбно
- Если пользователь говорит, что данные уже есть в системе:
  * Проверь, какие данные действительно есть
  * Если каких-то данных не хватает, объясни, что нужно дополнить
  * Не требуй повторно те данные, которые уже есть`}
- Если пользователь задает вопрос не про заявление:${hasGeneratedDocuments ? `
  * Ты можешь отвечать на вопросы о профсоюзе, скидках BestBenefits, структуре организации (см. раздел "РАСШИРЕННАЯ ФУНКЦИОНАЛЬНОСТЬ")
  * Используй информацию из базы знаний профсоюза и с сайта BestBenefits (https://bestbenefits.ru/)
  * Если вопрос не связан с профсоюзом или скидками, вежливо предложи: "Для решения других вопросов создайте новое обращение через кнопку 'Новый чат' в меню"` : `
  * Честно ответь, что пока ты специализируешься на помощи с заявлением о вступлении в профсоюз
  * Если вопрос не про заявление, вежливо предложи: "Для решения других вопросов и обращений создайте новое обращение через кнопку 'Новый чат' в меню"
  * Не переключайся на другие темы - оставайся в рамках помощи с заявлением`}

### ВАЖНО:
- Парси естественный язык пользователя и не требуй строгих форматов
- НЕ предлагай создавать обращения - для этого есть отдельный чат
- Всегда создавай заявление, даже если организации нет в базе
- Будь вежливым и профессиональным
- Будь терпеливым и понимающим, если пользователь отвечает не так, как ожидается`;
    
    // Если заявление уже сгенерировано, проверяем дополнительную информацию
    if (hasGeneratedDocuments && !additionalInfoComplete) {
      prompt += `\n\n## СБОР ДОПОЛНИТЕЛЬНОЙ ИНФОРМАЦИИ (после генерации заявления):

Заявление пользователя уже сгенерировано. Теперь собери дополнительную информацию о нём для более персонализированного общения:

### ПРИВЕТСТВИЕ:
Скажи: "Отлично! Ваше заявление сгенерировано. Теперь я хотел бы узнать немного больше о вас, чтобы лучше помогать вам. Расскажите, пожалуйста, о себе."

### ПОСЛЕДОВАТЕЛЬНОСТЬ СБОРА:

1. **РОД ЗАНЯТИЙ**: Спроси: "Чем вы занимаетесь?"
   - Более общий вопрос чем должность (например: врач, учитель, инженер)

2. **О СЕБЕ**: Спроси: "Расскажите немного о себе. Что вас вдохновляет? Какой у вас характер?"
   - Свободный рассказ о себе

3. **ХОББИ**: Спроси: "Какие у вас хобби и увлечения?"
   - Интересы, хобби

4. **СЕМЕЙНОЕ ПОЛОЖЕНИЕ**: Спроси: "Каково ваше семейное положение?"
   - Женат/Замужем, холост, в разводе и т.д.

5. **СУПРУГ/СУПРУГА**: Если в браке, спроси: "Расскажите о вашем супруге/супруге (имя, род занятий)"
   - Только если указал что в браке

6. **ДЕТИ**: Спроси: "Есть ли у вас дети?"
   - Если да, уточни: "Расскажите о ваших детях (имена, возраст)"

7. **ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ**: Спроси: "Есть ли что-то еще, что вы хотели бы рассказать о себе?"
   - Свободное поле

### ПОСЛЕ СБОРА:
Скажи: "Спасибо за информацию! Теперь я смогу лучше помогать вам. Вы можете задать мне любые вопросы о профсоюзе, структуре организации, председателе, скидках BestBenefits и многом другом."

### ВАЖНО:
- Собирай информацию естественно, в формате беседы
- Не требуй всё сразу - задавай вопросы по одному
- Если пользователь не хочет отвечать на какой-то вопрос, переходи к следующему
- Сохраняй полученные данные в профиль пользователя`;
    }
    
    // Если заявление уже сгенерировано И дополнительная информация заполнена, добавляем расширенную функциональность
    if (hasGeneratedDocuments && additionalInfoComplete) {
      prompt += `\n\n## РАСШИРЕННАЯ ФУНКЦИОНАЛЬНОСТЬ (после генерации заявления):

После того как заявление сгенерировано и вы узнали пользователя лучше, ты можешь помочь ему с дополнительными вопросами:

### ТЫ МОЖЕШЬ ОТВЕЧАТЬ НА ВОПРОСЫ О:

1. **ПРОФСОЮЗЕ:**
   - Устав и положение текущей организации профсоюза
   - Структура организации профсоюза
   - Кто является председателем профсоюза
   - История и деятельность профсоюза
   - Права и обязанности членов профсоюза
   - Как составить обращение в профсоюз
   - Процедуры и регламенты профсоюза
   
   Опирайся на информацию из базы знаний профсоюза, устава и положений.

2. **СКИДКАХ И УСЛОВИЯХ:**
   - Информация о партнерских программах и скидках
   - Условия получения скидок
   - Доступные предложения от партнеров
   - Категории скидок (рестораны, товары, услуги, обучение, развлечения и т.д.)
   - Специальные предложения и акции
   
   Используй информацию с сайта BestBenefits (https://bestbenefits.ru/):
   - Лучшие скидки и предложения для членов профсоюза
   - Категории: Рестораны и доставка, Техника и Электроника, Товары, Обучение, Отдых, Спорт, Красота и Здоровье, Дети, Развлечения, Услуги, Premium
   - Партнерские программы с различными компаниями

3. **СТРУКТУРЕ ОРГАНИЗАЦИИ:**
   - Кто является председателем профсоюза
   - Кто является руководящими лицами
   - Структура профсоюзных комитетов
   - Региональные отделения
   - Контакты и способы связи

4. **КАК СОСТАВИТЬ ОБРАЩЕНИЕ:**
   - Правила составления обращений в профсоюз
   - Форма и структура обращения
   - Какие вопросы можно решить через обращение
   - Куда направлять обращения
   - Сроки рассмотрения обращений

### ИНСТРУКЦИИ ПО РАБОТЕ:

- Если пользователь задает вопрос о профсоюзе, структуре, уставе:
  * Используй информацию из базы знаний (устав, положение, регламенты)
  * Отвечай на основе предоставленных документов
  * Если информации нет в базе знаний, честно скажи об этом

- Если пользователь спрашивает про скидки и условия:
  * Расскажи о партнерских программах BestBenefits
  * Упомяни категории скидок (рестораны, товары, услуги и т.д.)
  * Предложи перейти в раздел "Скидки" в приложении для просмотра доступных предложений
  * Опирайся на информацию с https://bestbenefits.ru/

- Если пользователь спрашивает про структуру организации:
  * Расскажи о председателе и руководящих лицах (если информация есть в базе знаний)
  * Объясни структуру профсоюза
  * Укажи контакты (если есть в базе знаний)

- Если пользователь хочет составить обращение:
  * Объясни правила составления обращения
  * Предложи использовать функцию "Новый чат" для создания обращения
  * Расскажи о процедуре рассмотрения обращений

### ВАЖНО:

- Оставайся в рамках информации о профсоюзе, скидках и структуре организации
- Используй информацию из базы знаний профсоюза и BestBenefits
- Будь полезным и информативным
- Если информации нет - честно об этом скажи
- Предлагай полезные действия (перейти в раздел скидок, создать обращение и т.д.)`;
    }
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
      // Создаем новую сессию для заявления (по умолчанию)
      chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: "Мой чат",
          type: "STATEMENT",
        },
      });
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

    // Получаем данные пользователя для проверки полноты профиля (только для STATEMENT сессий)
    let user = null;
    let hasGeneratedDocuments = false;
    if (chatSession.type === "STATEMENT") {
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
      });
      
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
        take: 1,
      });
      hasGeneratedDocuments = documents.length > 0;
      
      // Логируем для отладки
      if (hasGeneratedDocuments) {
        console.log(`[chat] User ${session.user.id} has ${documents.length} generated documents`);
      }
    }

    // Если в сообщении пользователя есть адрес, валидируем его через Dadata ДО отправки к AI
    let validatedAddress: string | null = null;
    let userMessage = message;
    if (message && (message.toLowerCase().includes("адрес") || message.toLowerCase().includes("живу") || message.toLowerCase().includes("проживаю"))) {
      try {
        console.log("[chat] Pre-validating address via Dadata:", message);
        validatedAddress = await validateAddressWithDaData(message);
        if (validatedAddress) {
          console.log("[chat] Address pre-validated via Dadata:", validatedAddress);
          // Сохраняем валидированный адрес в профиль сразу (без добавления метки в сообщение)
          await prisma.user.update({
            where: { id: session.user.id },
            data: { address: validatedAddress },
          });
        }
      } catch (dadataError) {
        console.warn("[chat] Error pre-validating address with Dadata:", dadataError);
      }
    }

    // Если в сообщении пользователя есть название организации, ищем её ДО отправки к AI
    let foundOrganization: { name: string; foundInDatabase: boolean; id?: string } | null = null;
    if (chatSession.type === "STATEMENT" && message && (message.toLowerCase().includes("организац") || message.toLowerCase().includes("работаю") || message.toLowerCase().includes("работа"))) {
      try {
        // Получаем регион пользователя для более точного поиска
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { region: true },
        });
        
        console.log("[chat] Searching organization before AI:", message);
        foundOrganization = await findOrganization(message, user?.region || undefined);
        
        if (foundOrganization) {
          console.log("[chat] Organization found:", foundOrganization.name, "in DB:", foundOrganization.foundInDatabase);
          // Добавляем метку в сообщение для AI, чтобы он мог показать найденную организацию пользователю
          userMessage = `${message}\n\n[НАЙДЕНА ОРГАНИЗАЦИЯ: ${foundOrganization.name}${foundOrganization.foundInDatabase ? " (в базе МойСоюз)" : " (в реестре Минюста РФ)"}]`;
        } else {
          console.log("[chat] Organization not found");
        }
      } catch (orgError) {
        console.warn("[chat] Error searching organization before AI:", orgError);
      }
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

    // Проверяем, был ли недавно загружен документ (в последних сообщениях пользователя)
    let uploadedDocument: { type: string; fileName: string; documentId: string } | null = null;
    if (message && (message.toLowerCase().includes("загрузил файл") || message.toLowerCase().includes("загружен файл"))) {
      // Ищем последний загруженный документ пользователя
      const recentDocuments = await prisma.document.findMany({
        where: {
          userId: session.user.id,
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // За последние 5 минут
          },
          status: "SIGNED", // Подписанные документы
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      });

      if (recentDocuments.length > 0) {
        const doc = recentDocuments[0];
        uploadedDocument = {
          type: doc.type,
          fileName: doc.fileName || doc.title,
          documentId: doc.id,
        };
        console.log("[chat] Found uploaded document:", uploadedDocument);
      }
    }

    // Добавляем информацию о загруженном документе в системный промпт, если он есть
    let enhancedSystemPrompt = systemPrompt;
    if (uploadedDocument) {
      enhancedSystemPrompt += `\n\n[ВАЖНО: Пользователь только что загрузил документ]
Тип документа: ${uploadedDocument.type}
Имя файла: ${uploadedDocument.fileName}
ID документа: ${uploadedDocument.documentId}

Это подписанное заявление, которое пользователь загрузил для проверки. Ты должен:
1. Подтвердить получение документа
2. Сообщить, что документ проверен
3. Напомнить о необходимости принести оригиналы в Профком
НЕ проси подтверждать данные профиля - документ уже загружен и проверяется.`;
    }

    // Формируем массив сообщений для OpenRouter
    const messages: ChatMessagePayload[] = [
      {
        role: "system",
        content: enhancedSystemPrompt,
      },
      ...chatHistory.map((msg) => ({
        role: msg.role as ChatMessagePayload["role"],
        content: msg.content,
      })),
      {
        role: "user",
        content: userMessage,
      },
    ];

    // Сохраняем сообщение пользователя с привязкой к сессии
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        sessionId: chatSession.id,
        role: "user",
        content: message,
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

        // Проверяем, есть ли уже маркер
        const hasCompleteMarker = allMessages.some(
          msg => msg.role === "assistant" && msg.content.includes("[PROFILE_COMPLETE]")
        );

        // Всегда пытаемся извлечь и обновить данные из чата (даже если маркер есть, чтобы обновить данные)
        console.log("[chat] Extracting profile data from messages...");
        
        try {
          // Пытаемся извлечь данные из сообщений чата (включая новое сообщение)
          const messagesForExtraction = [
            ...allMessages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: "user" as const,
              content: message,
            },
            {
              role: "assistant" as const,
              content: aiResponse,
            },
          ];
          
          // Функция извлечения
          const extractedData = await extractProfileDataFromMessages(messagesForExtraction);
          
          console.log("[chat] Extracted data:", extractedData);
          
          // Если в сообщении пользователя есть адрес, валидируем его через Dadata
          if (message && (message.toLowerCase().includes("адрес") || message.toLowerCase().includes("живу") || message.toLowerCase().includes("проживаю") || extractedData.address)) {
            const addressToValidate = extractedData.address || message;
            if (addressToValidate && addressToValidate.length > 5) {
              try {
                console.log("[chat] Validating address via Dadata:", addressToValidate);
                const validatedAddress = await validateAddressWithDaData(addressToValidate);
                if (validatedAddress) {
                  extractedData.address = validatedAddress;
                  console.log("[chat] Address validated via Dadata:", validatedAddress);
                  // Обновляем адрес в профиле сразу
                  await prisma.user.update({
                    where: { id: session.user.id },
                    data: { address: validatedAddress },
                  });
                } else {
                  console.log("[chat] Address could not be validated via Dadata, using original");
                }
              } catch (dadataError) {
                console.warn("[chat] Error validating address with Dadata:", dadataError);
              }
            }
          }
          
          // Если организация уже была найдена до отправки к AI, используем её
          if (foundOrganization) {
            if (foundOrganization.foundInDatabase && foundOrganization.id) {
              // Организация найдена в базе - привязываем к пользователю
              extractedData.organizationId = foundOrganization.id;
              console.log("[chat] Using organization found before AI (in database):", foundOrganization.name);
            } else {
              // Организация найдена в Минюсте, но не в базе - сохраняем название
              extractedData.organizationName = foundOrganization.name;
              console.log("[chat] Using organization found before AI (in Minjust):", foundOrganization.name);
            }
          } else if (extractedData.organizationName || message.includes("организац") || message.includes("работаю")) {
            // Если организация не была найдена до AI, пытаемся найти её сейчас
            const orgName = extractedData.organizationName || message;
            const userRegion = extractedData.region;
            
            try {
              const foundOrg = await findOrganization(orgName, userRegion);
              if (foundOrg?.foundInDatabase && foundOrg.id) {
                // Организация найдена в базе - привязываем к пользователю
                extractedData.organizationId = foundOrg.id;
                console.log("[chat] Organization found in database:", foundOrg.name);
              } else if (foundOrg?.name) {
                // Организация найдена в Минюсте, но не в базе - сохраняем название
                extractedData.organizationName = foundOrg.name;
                console.log("[chat] Organization found in Minjust:", foundOrg.name);
              }
            } catch (orgError) {
              console.warn("[chat] Error searching organization:", orgError);
            }
          }
          
          // Обновляем профиль с извлеченными данными
          if (Object.keys(extractedData).length > 0) {
            // Получаем текущие данные пользователя для проверки
            const currentUser = await prisma.user.findUnique({
              where: { id: session.user.id },
            });
            
            // Убираем пустые значения и organizationName (это не поле в User)
            const cleanData = Object.fromEntries(
              Object.entries(extractedData).filter(
                ([key, value]) =>
                  key !== "organizationName" && // organizationName не сохраняем напрямую
                  value !== undefined &&
                  value !== null &&
                  value !== "" &&
                  !(typeof value === "number" && Number.isNaN(value))
              )
            );
            
            // ЗАЩИТА: Не перезаписываем ФИО географическими названиями
            const geoWords = [
              'Республика', 'Область', 'Край', 'Округ', 'Регион', 'Город',
              'Татарстан', 'Башкортостан', 'Москва', 'Казань', 'Санкт', 'Петербург'
            ];
            
            // Проверяем firstName
            if (cleanData.firstName && currentUser?.firstName) {
              const isGeoName = geoWords.some(word => 
                cleanData.firstName.includes(word) || word.includes(cleanData.firstName)
              );
              if (isGeoName) {
                console.log("[chat] ⚠️ Skipping firstName update - looks like a geographic name:", cleanData.firstName);
                delete cleanData.firstName;
              }
            }
            
            // Проверяем lastName
            if (cleanData.lastName && currentUser?.lastName) {
              const isGeoName = geoWords.some(word => 
                cleanData.lastName.includes(word) || word.includes(cleanData.lastName)
              );
              if (isGeoName) {
                console.log("[chat] ⚠️ Skipping lastName update - looks like a geographic name:", cleanData.lastName);
                delete cleanData.lastName;
              }
            }
            
            // Проверяем middleName
            if (cleanData.middleName && currentUser?.middleName) {
              const isGeoName = geoWords.some(word => 
                cleanData.middleName.includes(word) || word.includes(cleanData.middleName)
              );
              if (isGeoName) {
                console.log("[chat] ⚠️ Skipping middleName update - looks like a geographic name:", cleanData.middleName);
                delete cleanData.middleName;
              }
            }
            
            if (Object.keys(cleanData).length > 0) {
              await prisma.user.update({
                where: { id: session.user.id },
                data: cleanData,
              });
              console.log("[chat] Profile updated with extracted data:", cleanData);
            }
          }
        } catch (extractError) {
          console.warn("[chat] Error extracting data:", extractError);
        }

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

        // Добавляем маркер только если его еще нет и профиль заполнен
        if (!hasCompleteMarker && profileIsComplete) {
          console.log("[chat] ✅ Profile is COMPLETE! Adding [PROFILE_COMPLETE] marker");
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

    // Сохраняем ответ AI с привязкой к сессии
    await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        sessionId: chatSession.id,
        role: "assistant",
        content: aiResponse,
        chatBotId: bot.id,
      },
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
    
    // Ищем последнюю сессию заявления (STATEMENT) или создаем новую
    let chatSession = await prisma.chatSession.findFirst({
      where: {
        userId: session.user.id,
        type: "STATEMENT",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Если нет сессии заявления, создаем новую
    if (!chatSession) {
      console.log("GET /api/chat: Сессии заявления нет, создаем новую...");
      chatSession = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: "Заявление",
          type: "STATEMENT",
        },
      });
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
        : "Здравствуйте! Я ваш помощник для вступления в Профсоюз работников здравоохранения РФ. Я помогу вам заполнить профиль и подготовить необходимые документы для этого. Давайте начнем. Укажите регион России, в которой вы находитесь.";
      
      console.log("GET /api/chat: Создание приветственного сообщения в БД...");
      const welcomeMessage = await prisma.chatMessage.create({
        data: {
          content: welcomeMessageContent,
          role: "assistant",
          userId: session.user.id,
          sessionId: chatSession.id,
          chatBotId: bot.id,
        },
      });
      console.log("GET /api/chat: Приветственное сообщение создано. ID:", welcomeMessage.id);
      return NextResponse.json({ 
        session: {
          id: chatSession.id,
          title: chatSession.title,
          type: chatSession.type,
        },
        messages: [welcomeMessage] 
      });
    }

    console.log("GET /api/chat: Возвращаем историю сообщений.");
    return NextResponse.json({ 
      session: {
        id: chatSession.id,
        title: chatSession.title,
        type: chatSession.type,
      },
      messages 
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

