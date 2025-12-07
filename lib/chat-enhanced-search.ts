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
  organizationName: string
): Promise<EnhancedSearchResult["organizationInfo"]> {
  try {
    // Извлекаем ключевые слова из названия организации
    const keywords = organizationName
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .map((w) => w.toLowerCase());

    // Если название короткое или содержит ключевые слова типа "МООП РЗ РФ"
    // используем более гибкий поиск
    let organizations;

    if (keywords.length === 0 || keywords.every((k) => k.length < 3)) {
      // Если ключевые слова слишком короткие, ищем по частичному совпадению
      organizations = await prisma.organization.findMany({
        where: {
          AND: [
            {
              name: {
                contains: organizationName.trim(),
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
      organizations = await prisma.organization.findMany({
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
    if (organizations.length === 0 && keywords.length > 0) {
      organizations = await prisma.organization.findMany({
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

    return organizations.map((org) => ({
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

  try {
    // 1. Поиск в базе знаний
    const chunks = await retrieveRelevantChunks(query, botId, 5);
    result.knowledgeBaseChunks = chunks.map((chunk) => ({
      content: chunk.content,
      similarity: chunk.similarity,
      metadata: chunk.metadata || {},
    }));

    // 1.5. Поиск в персональной базе знаний пользователя (если userId передан)
    if (userId) {
      try {
        const { searchUserKnowledge } = await import("@/lib/user-knowledge-base");
        const userChunks = await searchUserKnowledge(userId, query, 3);
        
        // Добавляем результаты пользователя к общим результатам с пометкой
        result.knowledgeBaseChunks.push(
          ...userChunks.map((chunk) => ({
            content: `[Персональная информация о пользователе]\n${chunk.content}`,
            similarity: chunk.similarity,
            metadata: {
              ...chunk,
              source: "user_knowledge_base",
              type: chunk.type,
            },
          }))
        );

        // Сортируем все chunks по релевантности
        result.knowledgeBaseChunks.sort((a, b) => b.similarity - a.similarity);
      } catch (userKbError) {
        console.error("[enhanced-search] Error searching user knowledge base:", userKbError);
        // Продолжаем выполнение, даже если поиск в пользовательской базе знаний не удался
      }
    }

    // 2. Если запрос об организации - ищем в БД организаций
    if (isOrganizationQuery(query)) {
      const orgName = extractOrganizationName(query);
      if (orgName) {
        const orgInfo = await searchOrganizationWithChairman(orgName);
        result.organizationInfo = orgInfo;
      } else {
        // Если не удалось извлечь название, ищем по ключевым словам
        const orgInfo = await searchOrganizationWithChairman(query);
        result.organizationInfo = orgInfo;
      }
    }

    // 3. Если запрос об организации - всегда пробуем поиск в интернете для свежей информации
    // (особенно если в БД нет председателя или информации недостаточно)
    if (isOrganizationQuery(query)) {
      const orgName = extractOrganizationName(query) || query;
      const hasChairmanInfo = result.organizationInfo.some(
        (org) => org.chairmanName
      );
      const hasEnoughInfo =
        result.knowledgeBaseChunks.length > 0 ||
        (result.organizationInfo.length > 0 && hasChairmanInfo);

      // Ищем в интернете если:
      // - информации нет вообще
      // - или есть организация, но нет информации о председателе
      if (!hasEnoughInfo || !hasChairmanInfo) {
        // Формируем запрос для веб-поиска
        const webQuery = `председатель ${orgName} профсоюз`;
        console.log("[enhanced-search] 🔍 Triggering web search for organization query");
        result.webSearchResults = await searchWeb(webQuery, 3);
      }
    }

    return result;
  } catch (error) {
    console.error("[enhanced-search] Error in enhanced search:", error);
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
      ...results.knowledgeBaseChunks.map(
        (chunk, i) =>
          `[Документ ${i + 1}] (релевантность: ${(chunk.similarity * 100).toFixed(0)}%)\n${chunk.content}`
      )
    );
  }

  // Информация об организациях
  if (results.organizationInfo.length > 0) {
    sections.push(
      "### ИНФОРМАЦИЯ ОБ ОРГАНИЗАЦИЯХ ИЗ БАЗЫ ДАННЫХ:",
      ...results.organizationInfo.map((org) => {
        const parts = [`Организация: ${org.name}`];
        if (org.chairmanName) {
          parts.push(`Председатель: ${org.chairmanName}`);
        }
        if (org.chairmanJobTitle) {
          parts.push(`Должность: ${org.chairmanJobTitle}`);
        }
        if (org.phone) {
          parts.push(`Телефон: ${org.phone}`);
        }
        if (org.email) {
          parts.push(`Email: ${org.email}`);
        }
        if (org.address) {
          parts.push(`Адрес: ${org.address}`);
        }
        return parts.join("\n");
      })
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

