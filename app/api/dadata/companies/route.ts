import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchCompanies, getCompanyByInn } from "@/lib/dadata";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dadata/companies?query=... - Поиск компаний
 * GET /api/dadata/companies?inn=... - Получить компанию по ИНН
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");
    const inn = searchParams.get("inn");

    // Поиск по ИНН
    if (inn) {
      const company = await getCompanyByInn(inn);
      
      if (!company) {
        return NextResponse.json(
          { error: "Компания не найдена" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        company,
      });
    }

    // Поиск по названию
    if (!query) {
      return NextResponse.json(
        { error: "Необходимо указать query или inn" },
        { status: 400 }
      );
    }

    // Нормализуем запрос для поиска
    const normalizedQuery = query.trim().toLowerCase();
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

    // Ищем и в компаниях через DaData, и в профсоюзных организациях из базы
    const [companies, allOrganizations] = await Promise.all([
      searchCompanies(query),
      // Ищем в профсоюзных организациях - улучшенный поиск
      prisma.organization.findMany({
        where: {
          isActive: true,
          OR: [
            // Точное совпадение в начале названия
            {
              name: {
                startsWith: query,
                mode: "insensitive" as const,
              },
            },
            // Содержит запрос в названии
            {
              name: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            // Содержит запрос в полном пути
            {
              fullPath: {
                contains: query,
                mode: "insensitive" as const,
              },
            },
            // Поиск по отдельным словам (если запрос состоит из нескольких слов)
            ...(queryWords.length > 1 ? [{
              AND: queryWords.map(word => ({
                OR: [
                  {
                    name: {
                      contains: word,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    fullPath: {
                      contains: word,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              })),
            }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          inn: true,
          type: true,
          fullPath: true,
          chairmanName: true,
        },
        take: 10, // Увеличиваем количество результатов
      }),
    ]);

    // Сортируем организации по релевантности
    const organizations = allOrganizations.sort((a, b) => {
      const aName = (a.fullPath || a.name).toLowerCase();
      const bName = (b.fullPath || b.name).toLowerCase();
      const queryLower = normalizedQuery;

      // Точное совпадение - самый высокий приоритет
      if (aName === queryLower && bName !== queryLower) return -1;
      if (bName === queryLower && aName !== queryLower) return 1;
      
      // Начинается с запроса
      if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
      if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1;
      
      // Содержит запрос в начале
      const aIndex = aName.indexOf(queryLower);
      const bIndex = bName.indexOf(queryLower);
      if (aIndex !== -1 && bIndex !== -1) {
        if (aIndex < bIndex) return -1;
        if (bIndex < aIndex) return 1;
      }
      if (aIndex !== -1 && bIndex === -1) return -1;
      if (bIndex !== -1 && aIndex === -1) return 1;
      
      // По алфавиту
      return aName.localeCompare(bName, 'ru');
    });

    // Преобразуем организации в формат CompanySuggestion для единообразия
    const orgSuggestions = organizations.map(org => ({
      value: org.fullPath || org.name,
      unrestricted_value: org.fullPath || org.name,
      data: {
        inn: org.inn || "",
        name: {
          full: org.fullPath || org.name,
          short: org.name,
        },
        // Добавляем информацию о руководителе если есть
        management: org.chairmanName ? {
          name: org.chairmanName,
          post: "ПРЕДСЕДАТЕЛЬ",
        } : undefined,
        // Помечаем как профсоюзную организацию
        opf: {
          full: `Профсоюзная организация (${org.type})`,
        },
      },
    }));

    // Объединяем результаты: сначала профсоюзные организации, потом компании
    const allSuggestions = [...orgSuggestions, ...companies];

    return NextResponse.json({
      success: true,
      suggestions: allSuggestions,
    });
  } catch (error: any) {
    console.error("[api/dadata/companies] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Ошибка при поиске компаний" },
      { status: 500 }
    );
  }
}

