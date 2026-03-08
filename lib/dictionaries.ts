import { prisma } from "@/lib/prisma";

const RESTRICTED_SELF_SERVICE_JOB_TITLES = new Set([
  "председатель",
  "председатель ппо",
]);

function normalizeJobTitleKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isRestrictedJobTitleForSelfService(value: string | null | undefined): boolean {
  if (!value) return false;
  return RESTRICTED_SELF_SERVICE_JOB_TITLES.has(normalizeJobTitleKey(value));
}

/**
 * Словарь алиасов для медицинских должностей
 * Ключ - что пользователь может написать, значение - как искать в справочнике
 */
const JOB_TITLE_ALIASES: Record<string, string[]> = {
  // Врачебные специальности
  "хирург": ["врач-хирург"],
  "терапевт": ["врач-терапевт"],
  "педиатр": ["врач-педиатр"],
  "кардиолог": ["врач-кардиолог"],
  "невролог": ["врач-невролог"],
  "офтальмолог": ["врач-офтальмолог"],
  "окулист": ["врач-офтальмолог"],
  "лор": ["врач-оториноларинголог"],
  "отоларинголог": ["врач-оториноларинголог"],
  "гинеколог": ["врач-акушер-гинеколог"],
  "уролог": ["врач-уролог"],
  "дерматолог": ["врач-дерматовенеролог"],
  "психиатр": ["врач-психиатр"],
  "нарколог": ["врач-нарколог", "врач-психиатр-нарколог"],
  "анестезиолог": ["врач-анестезиолог-реаниматолог"],
  "реаниматолог": ["врач-анестезиолог-реаниматолог"],
  "рентгенолог": ["врач-рентгенолог"],
  "узи": ["врач ультразвуковой диагностики"],
  "эндоскопист": ["врач-эндоскопист"],
  "онколог": ["врач-онколог"],
  "травматолог": ["врач-травматолог-ортопед"],
  "ортопед": ["врач-травматолог-ортопед"],
  "стоматолог": ["врач-стоматолог"],
  "инфекционист": ["врач-инфекционист"],
  "эндокринолог": ["врач-эндокринолог"],
  "гастроэнтеролог": ["врач-гастроэнтеролог"],
  "пульмонолог": ["врач-пульмонолог"],
  "ревматолог": ["врач-ревматолог"],
  "нефролог": ["врач-нефролог"],
  "гематолог": ["врач-гематолог"],
  "аллерголог": ["врач-аллерголог-иммунолог"],
  "иммунолог": ["врач-аллерголог-иммунолог"],
  "физиотерапевт": ["врач-физиотерапевт"],
  "врач": ["врач-терапевт", "врач-специалист"],
  
  // Средний медперсонал
  "медсестра": ["медицинская сестра (медицинский брат)", "медицинская сестра"],
  "медицинская сестра": ["медицинская сестра (медицинский брат)"],
  "медбрат": ["медицинская сестра (медицинский брат)"],
  "фельдшер": ["фельдшер"],
  "акушерка": ["акушер (акушерка)"],
  "акушер": ["акушер (акушерка)"],
  "лаборант": ["лаборант"],
  "санитар": ["санитар", "санитарка"],
  "санитарка": ["санитар", "санитарка"],
  
  // Административные
  "главврач": ["главный врач медицинской организации", "главный врач"],
  "главный врач": ["главный врач медицинской организации"],
  "заведующий": ["заведующий отделением"],
  "завотделением": ["заведующий отделением"],
  "старшая сестра": ["старшая медицинская сестра"],
  "главная сестра": ["главная медицинская сестра (главный медицинский брат)"],
  "главный фельдшер": ["главный фельдшер"],
};

/**
 * Ищет наиболее подходящую должность в справочнике
 */
export async function findJobTitle(query: string): Promise<string | null> {
  if (!query || query.length < 2) return null;

  const normalizedQuery = query.trim().toLowerCase();
  console.log(`[dictionaries] Finding job title for: "${normalizedQuery}"`);

  // 1. Проверяем алиасы (точное совпадение)
  const aliases = JOB_TITLE_ALIASES[normalizedQuery];
  if (aliases) {
    for (const alias of aliases) {
      const found = await prisma.jobTitle.findFirst({
        where: { name: { equals: alias, mode: "insensitive" } },
  });
      if (found) {
        console.log(`[dictionaries] ✅ Found via alias: "${normalizedQuery}" → "${found.name}"`);
        return found.name;
      }
    }
  }

  // 1.5. Пробуем заменить пробелы на дефисы и проверить снова (например, "врач хирург" → "врач-хирург")
  if (normalizedQuery.includes(' ')) {
    const withHyphen = normalizedQuery.replace(/\s+/g, '-');
    const aliasesWithHyphen = JOB_TITLE_ALIASES[withHyphen];
    if (aliasesWithHyphen) {
      for (const alias of aliasesWithHyphen) {
        const found = await prisma.jobTitle.findFirst({
          where: { name: { equals: alias, mode: "insensitive" } },
        });
        if (found) {
          console.log(`[dictionaries] ✅ Found via normalized alias: "${normalizedQuery}" → "${withHyphen}" → "${found.name}"`);
          return found.name;
        }
      }
    }

    // Также проверим прямое совпадение с дефисом
    const exactWithHyphen = await prisma.jobTitle.findFirst({
      where: { name: { equals: withHyphen, mode: "insensitive" } },
      });
    if (exactWithHyphen) {
      console.log(`[dictionaries] ✅ Found by replacing space with hyphen: "${normalizedQuery}" → "${exactWithHyphen.name}"`);
      return exactWithHyphen.name;
    }
  }

  // 2. Точное совпадение
  const exact = await prisma.jobTitle.findFirst({
    where: { name: { equals: normalizedQuery, mode: "insensitive" } },
  });
  if (exact) {
    console.log(`[dictionaries] ✅ Exact match: "${exact.name}"`);
    return exact.name;
  }

  // 3. Поиск с префиксом "врач-"
  const withVrachPrefix = `врач-${normalizedQuery}`;
  const withPrefix = await prisma.jobTitle.findFirst({
    where: { name: { equals: withVrachPrefix, mode: "insensitive" } },
  });
  if (withPrefix) {
    console.log(`[dictionaries] ✅ Found with prefix: "${withPrefix.name}"`);
    return withPrefix.name;
  }

  // 4. Поиск всех частичных совпадений и выбор САМОГО КОРОТКОГО (наиболее точного)
  const partials = await prisma.jobTitle.findMany({
    where: { name: { contains: normalizedQuery, mode: "insensitive" } },
    take: 20,
  });

  if (partials.length > 0) {
    // Сортируем по длине - короткие названия более точные
    partials.sort((a, b) => a.name.length - b.name.length);
    
    // Предпочитаем варианты которые заканчиваются на искомое слово (врач-хирург для "хирург")
    const endsWithQuery = partials.find(p => 
      p.name.toLowerCase().endsWith(normalizedQuery) || 
      p.name.toLowerCase().endsWith(`-${normalizedQuery}`)
    );
    
    if (endsWithQuery) {
      console.log(`[dictionaries] ✅ Best match (ends with): "${endsWithQuery.name}"`);
      return endsWithQuery.name;
    }
    
    // Иначе возвращаем самое короткое
    console.log(`[dictionaries] ✅ Shortest match: "${partials[0].name}"`);
    return partials[0].name;
  }

  console.log(`[dictionaries] ❌ Not found: "${normalizedQuery}"`);
  return null;
}

/**
 * Ищет наиболее подходящую профессию в справочнике
 */
export async function findProfession(query: string): Promise<string | null> {
  if (!query || query.length < 2) return null;

  const normalizedQuery = query.trim().toLowerCase();
  console.log(`[dictionaries] Finding profession for: "${normalizedQuery}"`);

  // 1. Проверяем алиасы (используем те же что и для должностей)
  const aliases = JOB_TITLE_ALIASES[normalizedQuery];
  if (aliases) {
    for (const alias of aliases) {
      const found = await prisma.profession.findFirst({
        where: { name: { equals: alias, mode: "insensitive" } },
  });
      if (found) {
        console.log(`[dictionaries] ✅ Found via alias: "${normalizedQuery}" → "${found.name}"`);
        return found.name;
      }
    }
  }

  // 1.5. Пробуем заменить пробелы на дефисы и проверить снова
  if (normalizedQuery.includes(' ')) {
    const withHyphen = normalizedQuery.replace(/\s+/g, '-');
    const aliasesWithHyphen = JOB_TITLE_ALIASES[withHyphen];
    if (aliasesWithHyphen) {
      for (const alias of aliasesWithHyphen) {
        const found = await prisma.profession.findFirst({
          where: { name: { equals: alias, mode: "insensitive" } },
        });
        if (found) {
          console.log(`[dictionaries] ✅ Found via normalized alias: "${normalizedQuery}" → "${withHyphen}" → "${found.name}"`);
          return found.name;
        }
      }
    }

    // Также проверим прямое совпадение с дефисом
    const exactWithHyphen = await prisma.profession.findFirst({
      where: { name: { equals: withHyphen, mode: "insensitive" } },
      });
    if (exactWithHyphen) {
      console.log(`[dictionaries] ✅ Found by replacing space with hyphen: "${normalizedQuery}" → "${exactWithHyphen.name}"`);
      return exactWithHyphen.name;
    }
  }

  // 2. Точное совпадение
  const exact = await prisma.profession.findFirst({
    where: { name: { equals: normalizedQuery, mode: "insensitive" } },
  });
  if (exact) {
    console.log(`[dictionaries] ✅ Exact match: "${exact.name}"`);
    return exact.name;
  }

  // 3. Поиск с префиксом "врач-"
  const withVrachPrefix = `врач-${normalizedQuery}`;
  const withPrefix = await prisma.profession.findFirst({
    where: { name: { equals: withVrachPrefix, mode: "insensitive" } },
  });
  if (withPrefix) {
    console.log(`[dictionaries] ✅ Found with prefix: "${withPrefix.name}"`);
    return withPrefix.name;
  }

  // 4. Поиск всех частичных совпадений и выбор САМОГО КОРОТКОГО
  const partials = await prisma.profession.findMany({
    where: { name: { contains: normalizedQuery, mode: "insensitive" } },
    take: 20,
  });

  if (partials.length > 0) {
    partials.sort((a, b) => a.name.length - b.name.length);
    
    const endsWithQuery = partials.find(p => 
      p.name.toLowerCase().endsWith(normalizedQuery) || 
      p.name.toLowerCase().endsWith(`-${normalizedQuery}`)
    );
    
    if (endsWithQuery) {
      console.log(`[dictionaries] ✅ Best match (ends with): "${endsWithQuery.name}"`);
      return endsWithQuery.name;
    }
    
    console.log(`[dictionaries] ✅ Shortest match: "${partials[0].name}"`);
    return partials[0].name;
  }

  console.log(`[dictionaries] ❌ Not found: "${normalizedQuery}"`);
  return null;
}

/**
 * Получает список всех профессий (для API)
 */
export async function getProfessions() {
  return await prisma.profession.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * Получает список всех должностей (для API)
 */
export async function getJobTitles() {
  const titles = await prisma.jobTitle.findMany({
    orderBy: { name: "asc" },
  });
  return titles.filter((title) => !isRestrictedJobTitleForSelfService(title.name));
}

