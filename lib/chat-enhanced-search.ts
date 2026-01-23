/**
 * Расширенный поиск информации для чат-бота
 * Ищет информацию в базе знаний, БД организаций и интернете
 */

import { prisma } from "@/lib/prisma";
import { retrieveRelevantChunks } from "@/lib/vector-search";
import { searchOrganizationInDatabase } from "@/lib/organization-search";

export interface EnhancedSearchResult {
  knowledgeBaseChunks: Array<{
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
  organizationInfo: Array<{
    name: string;
    chairmanName?: string;
    chairmanJobTitle?: string;
    phone?: string;
    email?: string;
    address?: string;
  }>;
  webSearchResults: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}

/**
 * Поиск информации об организации в базе данных с председателем
 */
async function searchOrganizationWithChairman(
  organizationName: string,
  userOrganizationName?: string | null
): Promise<EnhancedSearchResult["organizationInfo"]> {
  try {
    // Если у нас есть организация пользователя и запрос про "нашу" организацию,
    // добавляем её к вариантам поиска
    const searchNames = [organizationName];
    if (userOrganizationName && userOrganizationName !== organizationName) {
      searchNames.push(userOrganizationName);
    }
    
    let organizations: any[] = [];
    
    // Ищем по каждому варианту названия
    for (const searchName of searchNames) {
      // Извлекаем ключевые слова из названия организации
      const keywords = searchName
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .map((w) => w.toLowerCase());

      // Если название короткое или содержит ключевые слова типа "МООП РЗ РФ"
      // используем более гибкий поиск
      let currentOrgs;

      if (keywords.length === 0 || keywords.every((k) => k.length < 3)) {
        // Если ключевые слова слишком короткие, ищем по частичному совпадению
        currentOrgs = await prisma.organization.findMany({
          where: {
            AND: [
              {
                name: {
                  contains: searchName.trim(),
                  mode: "insensitive" as const,
                },
              },
              { isActive: true },
            ],
          },
          select: {
            name: true,
            chairmanName: true,
            chairmanJobTitle: true,
            phone: true,
            email: true,
            address: true,
          },
          take: 5,
        });
      } else {
        // Поиск по названию организации с несколькими ключевыми словами
        currentOrgs = await prisma.organization.findMany({
          where: {
            AND: [
              {
                OR: keywords.map((keyword) => ({
                  name: {
                    contains: keyword,
                    mode: "insensitive" as const,
                  },
                })),
              },
              { isActive: true },
            ],
          },
          select: {
            name: true,
            chairmanName: true,
            chairmanJobTitle: true,
            phone: true,
            email: true,
            address: true,
          },
          take: 5,
        });
      }

      // Если не нашли точного совпадения, пробуем поиск по любому из слов
      if (currentOrgs.length === 0 && keywords.length > 0) {
        currentOrgs = await prisma.organization.findMany({
          where: {
            AND: [
              {
                OR: keywords
                  .filter((k) => k.length >= 3)
                  .map((keyword) => ({
                    name: {
                      contains: keyword,
                      mode: "insensitive" as const,
                    },
                  })),
              },
              { isActive: true },
            ],
          },
          select: {
            name: true,
            chairmanName: true,
            chairmanJobTitle: true,
            phone: true,
            email: true,
            address: true,
          },
          take: 5,
        });
      }
      
      organizations.push(...currentOrgs);
    }
    
    // Удаляем дубликаты по имени организации
    const uniqueOrganizations = Array.from(
      new Map(organizations.map(org => [org.name, org])).values()
    );

    return uniqueOrganizations.map((org) => ({
      name: org.name,
      chairmanName: org.chairmanName || undefined,
      chairmanJobTitle: org.chairmanJobTitle || undefined,
      phone: org.phone || undefined,
      email: org.email || undefined,
      address: org.address || undefined,
    }));
  } catch (error) {
    console.error("[enhanced-search] Error searching organizations:", error);
    return [];
  }
}

/**
 * Поиск в интернете через Tavily API или DuckDuckGo
 */
async function searchWeb(
  query: string,
  maxResults: number = 3
): Promise<EnhancedSearchResult["webSearchResults"]> {
  try {
    // Проверяем наличие Tavily API ключа
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    
    if (!tavilyApiKey) {
      console.log("[enhanced-search] TAVILY_API_KEY not configured, skipping web search");
      return [];
    }

    console.log("[enhanced-search] 🔍 Performing web search with Tavily API:", query);
    
    // Используем Tavily API для поиска
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        search_depth: "basic",
        include_domains: [],
        exclude_domains: [],
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[enhanced-search] Tavily API error (${response.status}):`, errorText);
      return [];
    }

    const data = await response.json();
    const results = data.results || [];
    
    console.log(`[enhanced-search] ✅ Found ${results.length} web search results`);
    
    return results.map((result: any) => ({
      title: result.title || "",
      url: result.url || "",
      snippet: result.content || result.snippet || "",
    }));
  } catch (error) {
    console.error("[enhanced-search] ❌ Error in web search:", error);
    return [];
  }
}

/**
 * Определяет, нужно ли искать информацию об организации
 */
function isOrganizationQuery(query: string): boolean {
  const orgKeywords = [
    "председатель",
    "руководитель",
    "глава",
    "директор",
    "организац",
    "МООП",
    "РЗ",
    "РФ",
    "кто возглавляет",
    "кто руководит",
    "кто директор",
    "председатель профсоюза",
    "руководитель профсоюза",
    "как зовут",
    "кто такой",
  ];

  const queryLower = query.toLowerCase();
  return orgKeywords.some((keyword) => queryLower.includes(keyword));
}

/**
 * Извлекает название организации из запроса
 */
function extractOrganizationName(query: string): string | null {
  // Ищем паттерны типа "председатель МООП РЗ РФ" или "руководитель организации X"
  const patterns = [
    /председатель\s+(?:профсоюза\s+)?([А-ЯЁа-яё\s]+?)(?:\s+\?|$|\.|,)/i,
    /руководитель\s+(?:профсоюза\s+)?([А-ЯЁа-яё\s]+?)(?:\s+\?|$|\.|,)/i,
    /глава\s+(?:профсоюза\s+)?([А-ЯЁа-яё\s]+?)(?:\s+\?|$|\.|,)/i,
    /кто\s+(?:возглавляет|руководит|директор)\s+(?:профсоюз\s+)?([А-ЯЁа-яё\s]+?)(?:\s+\?|$|\.|,)/i,
    /как\s+зовут\s+председателя\s+(?:профсоюза\s+)?([А-ЯЁа-яё\s]+?)(?:\s+\?|$|\.|,)/i,
    /([МООП][А-ЯЁа-яё\s]*РЗ\s*РФ?)/i,
    /([МООП][А-ЯЁа-яё\s]*)/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      // Убираем лишние знаки препинания
      const cleaned = extracted.replace(/[?.,!]+$/, "").trim();
      if (cleaned.length > 2) {
        return cleaned;
      }
    }
  }

  // Если не найдено точное совпадение, но есть ключевые слова - возвращаем часть запроса
  if (isOrganizationQuery(query)) {
    // Извлекаем слова после ключевых слов
    const afterKeywords = query.match(/(?:председатель|руководитель|глава|кто\s+(?:возглавляет|руководит|директор)|как\s+зовут\s+председателя)\s+(?:профсоюза\s+)?(?:профсоюз\s+)?(.+)/i);
    if (afterKeywords && afterKeywords[1]) {
      const extracted = afterKeywords[1].trim().replace(/[?.,!]+$/, "");
      if (extracted.length > 2) {
        return extracted;
      }
    }
    
    // Если в запросе есть упоминание МООП или других ключевых слов - ищем их
    const moopMatch = query.match(/МООП[А-ЯЁа-яё\s]*РЗ\s*РФ?/i);
    if (moopMatch) {
      return moopMatch[0].trim();
    }
  }

  return null;
}

/**
 * Основная функция расширенного поиска
 */
export async function enhancedSearch(
  query: string,
  botId: string,
  userId?: string
): Promise<EnhancedSearchResult> {
  const result: EnhancedSearchResult = {
    knowledgeBaseChunks: [],
    organizationInfo: [],
    webSearchResults: [],
  };

  console.log(`[enhanced-search] 🚀 Starting enhanced search for query: "${query}"`);

  try {
    // Получаем организацию пользователя для контекста
    let userOrgName: string | null = null;
    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { organization: true },
        });
        if (user?.organization?.name) {
          userOrgName = user.organization.name;
          console.log(`[enhanced-search] 👤 User organization: ${userOrgName}`);
        }
      } catch (e) {
        console.error("[enhanced-search] Error getting user org:", e);
      }
    }

    // 1. Поиск в базе знаний
    const chunks = await retrieveRelevantChunks(query, botId, 5);
    result.knowledgeBaseChunks = chunks.map((chunk) => {
      // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: убеждаемся что content - строка
      let content = chunk.content;
      if (typeof content !== 'string') {
        console.warn(`[enhanced-search] ⚠️ Chunk content is not a string, type: ${typeof content}`, content);
        // Если это объект или массив - сериализуем в JSON
        if (content && typeof content === 'object') {
          content = JSON.stringify(content, null, 2);
        } else {
          content = String(content || '');
        }
      }
      return {
        content,
        similarity: chunk.similarity,
        metadata: chunk.metadata || {},
      };
    });
    console.log(`[enhanced-search] 📚 Found ${result.knowledgeBaseChunks.length} knowledge base chunks`);

    // 1.5. Поиск в персональной базе знаний пользователя (если userId передан)
    if (userId) {
      try {
        const { searchUserKnowledge } = await import("@/lib/user-knowledge-base");
        const userChunks = await searchUserKnowledge(userId, query, 3);
        
        // Добавляем результаты пользователя к общим результатам с пометкой
        result.knowledgeBaseChunks.push(
          ...userChunks.map((chunk) => {
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: убеждаемся что content - строка
            let content = chunk.content;
            if (typeof content !== 'string') {
              console.warn(`[enhanced-search] ⚠️ User chunk content is not a string, type: ${typeof content}`, content);
              // Если это объект или массив - сериализуем в JSON
              if (content && typeof content === 'object') {
                content = JSON.stringify(content, null, 2);
              } else {
                content = String(content || '');
              }
            }
            return {
              content: `[Персональная информация о пользователе]\n${content}`,
              similarity: chunk.similarity,
              metadata: {
                ...chunk,
                source: "user_knowledge_base",
                type: chunk.type,
              },
            };
          })
        );

        // Сортируем все chunks по релевантности
        result.knowledgeBaseChunks.sort((a, b) => b.similarity - a.similarity);
        console.log(`[enhanced-search] 👤 Added ${userChunks.length} user knowledge chunks`);
      } catch (userKbError) {
        console.error("[enhanced-search] Error searching user knowledge base:", userKbError);
        // Продолжаем выполнение, даже если поиск в пользовательской базе знаний не удался
      }
    }

    // 2. Если запрос об организации - ищем в БД организаций
    const isOrgQuery = isOrganizationQuery(query);
    console.log(`[enhanced-search] 🏢 Is organization query: ${isOrgQuery}`);
    
    if (isOrgQuery) {
      let orgName = extractOrganizationName(query);
      console.log(`[enhanced-search] 📝 Extracted org name from query: ${orgName || "null"}`);
      
      // Если пользователь спрашивает про "наш/у нас/нашу" организацию без указания названия,
      // используем его организацию из профиля
      const isAboutOurOrg = /\b(наш|нашей|нашего|моей|моего|у\s+нас|у\s+меня|наша|нашу)\b/i.test(query);
      if (!orgName && isAboutOurOrg && userOrgName) {
        orgName = userOrgName;
        console.log(`[enhanced-search] 🎯 Using user's organization: ${orgName}`);
      }
      
      // Если всё ещё нет названия, но есть ключевое слово "председатель" и организация пользователя - используем её
      if (!orgName && /председатель/i.test(query) && userOrgName) {
        orgName = userOrgName;
        console.log(`[enhanced-search] 🎯 Using user's organization for chairman query: ${orgName}`);
      }
      
      if (orgName) {
        const orgInfo = await searchOrganizationWithChairman(orgName, userOrgName);
        result.organizationInfo = orgInfo;
        console.log(`[enhanced-search] 🏛️ Found ${orgInfo.length} organizations, chairman info: ${orgInfo.some(o => o.chairmanName)}`);
      } else {
        // Если не удалось извлечь название, ищем по ключевым словам, но используем организацию пользователя
        const orgInfo = await searchOrganizationWithChairman(query, userOrgName);
        result.organizationInfo = orgInfo;
        console.log(`[enhanced-search] 🔍 Fallback search found ${orgInfo.length} organizations`);
      }
    }

    // 3. Если запрос об организации - всегда пробуем поиск в интернете для свежей информации
    // (особенно если в БД нет председателя или информации недостаточно)
    if (isOrgQuery) {
      let orgName = extractOrganizationName(query);
      
      // Если спрашивают про "нашу/у нас" организацию - используем организацию пользователя
      const isAboutOurOrg = /\b(наш|нашей|нашего|моей|моего|у\s+нас|у\s+меня|наша|нашу)\b/i.test(query);
      if (!orgName && isAboutOurOrg && userOrgName) {
        orgName = userOrgName;
      }
      
      // Если всё ещё нет названия, но есть ключевое слово "председатель" и организация пользователя - используем её
      if (!orgName && /председатель/i.test(query) && userOrgName) {
        orgName = userOrgName;
      }
      
      // Если всё ещё нет названия - используем запрос целиком
      if (!orgName) {
        orgName = query;
      }
      
      const hasChairmanInfo = result.organizationInfo.some(
        (org) => org.chairmanName
      );
      const hasEnoughInfo =
        result.knowledgeBaseChunks.length > 0 ||
        (result.organizationInfo.length > 0 && hasChairmanInfo);

      console.log(`[enhanced-search] 📊 Has chairman info: ${hasChairmanInfo}, Has enough info: ${hasEnoughInfo}`);

      // Ищем в интернете если:
      // - информации нет вообще
      // - или есть организация, но нет информации о председателе
      if (!hasEnoughInfo || !hasChairmanInfo) {
        // Формируем запрос для веб-поиска
        const webQuery = `председатель ${orgName} профсоюз`;
        console.log(`[enhanced-search] 🌐 Triggering web search with query: "${webQuery}"`);
        result.webSearchResults = await searchWeb(webQuery, 3);
        console.log(`[enhanced-search] 🌐 Web search returned ${result.webSearchResults.length} results`);
      } else {
        console.log(`[enhanced-search] ⏭️ Skipping web search - enough info found`);
      }
    }

    console.log(`[enhanced-search] ✅ Search complete. KB: ${result.knowledgeBaseChunks.length}, Orgs: ${result.organizationInfo.length}, Web: ${result.webSearchResults.length}`);
    return result;
  } catch (error) {
    console.error("[enhanced-search] ❌ Error in enhanced search:", error);
    return result;
  }
}

/**
 * Форматирует результаты поиска для системного промпта
 */
export function formatSearchResultsForPrompt(
  results: EnhancedSearchResult
): string {
  const sections: string[] = [];

  // Информация из базы знаний
  if (results.knowledgeBaseChunks.length > 0) {
    sections.push(
      "### ИНФОРМАЦИЯ ИЗ БАЗЫ ЗНАНИЙ:",
      ...results.knowledgeBaseChunks.map((chunk, i) => {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: убеждаемся что content - строка перед форматированием
        let content = chunk.content;
        if (typeof content !== 'string') {
          console.warn(`[formatSearchResults] ⚠️ Chunk content is not a string in format, type: ${typeof content}`);
          if (content && typeof content === 'object') {
            content = JSON.stringify(content, null, 2);
          } else {
            content = String(content || '');
          }
        }
        return `[Документ ${i + 1}] (релевантность: ${(chunk.similarity * 100).toFixed(0)}%)\n${content}`;
      })
    );
  }

  // Информация об организациях
  if (results.organizationInfo.length > 0) {
    const orgSections = results.organizationInfo.map((org) => {
      const parts = [`Организация: ${org.name}`];
      if (org.chairmanName && org.chairmanName.trim()) {
        parts.push(`⭐ ПРЕДСЕДАТЕЛЬ: ${org.chairmanName}`);
      }
      if (org.chairmanJobTitle && org.chairmanJobTitle.trim()) {
        parts.push(`Должность: ${org.chairmanJobTitle}`);
      }
      if (org.phone && org.phone.trim()) {
        parts.push(`Телефон: ${org.phone}`);
      }
      if (org.email && org.email.trim()) {
        parts.push(`Email: ${org.email}`);
      }
      if (org.address && org.address.trim()) {
        parts.push(`Адрес: ${org.address}`);
      }
      return parts.join("\n");
    });
    
    // Логируем что передаём в промпт
    console.log("[enhanced-search] 📋 Organization info for prompt:", orgSections.join(" | "));
    
    sections.push(
      "### ⚠️ НАЙДЕННАЯ ИНФОРМАЦИЯ ОБ ОРГАНИЗАЦИЯХ (ИСПОЛЬЗУЙ ЭТО В ОТВЕТЕ!):",
      ...orgSections
    );
  }

  // Результаты веб-поиска
  if (results.webSearchResults.length > 0) {
    sections.push(
      "### ИНФОРМАЦИЯ ИЗ ИНТЕРНЕТА:",
      ...results.webSearchResults.map(
        (result, i) =>
          `[Источник ${i + 1}] ${result.title}\n${result.url}\n${result.snippet.substring(0, 300)}...`
      )
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : "";
}

