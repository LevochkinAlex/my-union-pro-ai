/**
 * Скрипт для заполнения справочника организаций
 * 
 * Структура из Figma: https://www.figma.com/board/5eya4cZhA4xyyYvCeglCkS/
 * 
 * Иерархия:
 * - МРОСПОМП (Московская региональная организация)
 *   - МСЧ-122 (Первичная профсоюзная организация)
 *   - МСЧ-123
 *   - ...
 * 
 * Запуск: pnpm tsx scripts/seed-organizations.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface OrganizationData {
  name: string;
  type: "FEDERATION" | "REGIONAL" | "PRIMARY";
  inn?: string;
  address?: string;
  phone?: string;
  email?: string;
  chairmanName?: string;
  sortOrder?: number;
  children?: OrganizationData[];
}

/**
 * Структура организаций
 * 
 * TODO: Заполнить полную структуру из Figma
 * Сейчас это пример для демонстрации
 */
const organizationsData: OrganizationData[] = [
  {
    name: "МРОСПОМП",
    type: "REGIONAL",
    inn: "7700000000",
    chairmanName: "Иванов Иван Иванович",
    sortOrder: 1,
    children: [
      {
        name: "МСЧ-122",
        type: "PRIMARY",
        sortOrder: 1,
      },
      {
        name: "МСЧ-123",
        type: "PRIMARY",
        sortOrder: 2,
      },
      {
        name: "МСЧ-125",
        type: "PRIMARY",
        sortOrder: 3,
      },
      {
        name: "МСЧ-126",
        type: "PRIMARY",
        sortOrder: 4,
      },
    ],
  },
  {
    name: "Профсоюз работников здравоохранения РФ",
    type: "FEDERATION",
    inn: "7707000000",
    address: "г. Москва",
    phone: "+7 (495) 123-45-67",
    email: "info@medsoyuz.ru",
    chairmanName: "Петров Петр Петрович",
    sortOrder: 2,
    children: [
      {
        name: "Региональная организация Москвы",
        type: "REGIONAL",
        sortOrder: 1,
        children: [
          {
            name: "ППО Больница №1",
            type: "PRIMARY",
            sortOrder: 1,
          },
          {
            name: "ППО Поликлиника №5",
            type: "PRIMARY",
            sortOrder: 2,
          },
        ],
      },
      {
        name: "Региональная организация Санкт-Петербурга",
        type: "REGIONAL",
        sortOrder: 2,
        children: [
          {
            name: "ППО Больница №10",
            type: "PRIMARY",
            sortOrder: 1,
          },
        ],
      },
    ],
  },
];

/**
 * Рекурсивная функция для создания организаций и их детей
 */
async function createOrganizationWithChildren(
  data: OrganizationData,
  parentId: string | null = null,
  level: number = 0
): Promise<string> {
  // Формируем полный путь
  let fullPath = data.name;
  if (parentId) {
    const parent = await prisma.organization.findUnique({
      where: { id: parentId },
      select: { fullPath: true, name: true },
    });
    if (parent) {
      fullPath = `${parent.fullPath || parent.name} / ${data.name}`;
    }
  }

  // Создаем организацию
  const organization = await prisma.organization.create({
    data: {
      name: data.name,
      type: data.type,
      parentId: parentId,
      level: level,
      sortOrder: data.sortOrder || 0,
      fullPath: fullPath,
      inn: data.inn || null,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      chairmanName: data.chairmanName || null,
      isActive: true,
    },
  });

  console.log(`✅ Создана: ${"  ".repeat(level)}${data.name} (level: ${level})`);

  // Создаем дочерние организации
  if (data.children && data.children.length > 0) {
    for (const child of data.children) {
      await createOrganizationWithChildren(child, organization.id, level + 1);
    }
  }

  return organization.id;
}

/**
 * Основная функция
 */
async function main() {
  console.log("🚀 Начинаем заполнение справочника организаций...\n");

  try {
    // Проверяем, есть ли уже организации
    const existingCount = await prisma.organization.count();
    if (existingCount > 0) {
      console.log(`⚠️  В базе уже есть ${existingCount} организаций.`);
      console.log("Хотите удалить их и создать заново? (y/n)");
      
      // В production нужно добавить интерактивный промпт
      // Для автоматического запуска закомментируйте следующую строку:
      throw new Error("В базе уже есть организации. Остановлено.");
      
      // Если нужно очистить:
      // await prisma.organization.deleteMany({});
      // console.log("✅ Старые организации удалены\n");
    }

    // Создаем организации
    for (const orgData of organizationsData) {
      await createOrganizationWithChildren(orgData);
      console.log(""); // Пустая строка между корневыми организациями
    }

    // Выводим статистику
    const totalCount = await prisma.organization.count();
    const byType = await prisma.organization.groupBy({
      by: ["type"],
      _count: true,
    });

    console.log("\n📊 Статистика:");
    console.log(`   Всего организаций: ${totalCount}`);
    byType.forEach((item) => {
      const typeName = 
        item.type === "FEDERATION" ? "Федеральных" :
        item.type === "REGIONAL" ? "Региональных" :
        "Первичных";
      console.log(`   ${typeName}: ${item._count}`);
    });

    console.log("\n✅ Справочник организаций успешно заполнен!");
    console.log("\n💡 Теперь пользователи могут выбирать организацию из списка в анкете.");
  } catch (error) {
    console.error("\n❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

