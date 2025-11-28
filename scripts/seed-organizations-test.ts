/**
 * Быстрый скрипт для создания тестовых организаций
 * Используйте для локальной разработки
 * 
 * Запуск: pnpm tsx scripts/seed-organizations-test.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Создаём тестовые организации...\n");

  try {
    // Создаём МРОСПОМП (региональная)
    const mrospomp = await prisma.organization.create({
      data: {
        name: "МРОСПОМП",
        type: "REGIONAL",
        level: 0,
        sortOrder: 1,
        fullPath: "МРОСПОМП",
        inn: "7700000000",
        chairmanName: "Иванов Иван Иванович",
        isActive: true,
      },
    });
    console.log("✅ Создана региональная организация: МРОСПОМП");

    // Создаём первичные организации (ППО)
    const ppoList = [
      { name: "МСЧ-122", sortOrder: 1 },
      { name: "МСЧ-123", sortOrder: 2 },
      { name: "МСЧ-125", sortOrder: 3 },
      { name: "МСЧ-126", sortOrder: 4 },
      { name: "МСЧ-130", sortOrder: 5 },
    ];

    for (const ppo of ppoList) {
      await prisma.organization.create({
        data: {
          name: ppo.name,
          type: "PRIMARY",
          parentId: mrospomp.id,
          level: 1,
          sortOrder: ppo.sortOrder,
          fullPath: `МРОСПОМП / ${ppo.name}`,
          isActive: true,
        },
      });
      console.log(`✅ Создана ППО: ${ppo.name}`);
    }

    // Создаём федеральную организацию для примера
    const federation = await prisma.organization.create({
      data: {
        name: "Профсоюз работников здравоохранения РФ",
        type: "FEDERATION",
        level: 0,
        sortOrder: 2,
        fullPath: "Профсоюз работников здравоохранения РФ",
        inn: "7707000000",
        address: "г. Москва",
        phone: "+7 (495) 123-45-67",
        email: "info@medsoyuz.ru",
        chairmanName: "Петров Петр Петрович",
        isActive: true,
      },
    });
    console.log("✅ Создана федеральная организация");

    // Создаём региональную под федеральной
    const regionalMoscow = await prisma.organization.create({
      data: {
        name: "Региональная организация Москвы",
        type: "REGIONAL",
        parentId: federation.id,
        level: 1,
        sortOrder: 1,
        fullPath: "Профсоюз работников здравоохранения РФ / Региональная организация Москвы",
        isActive: true,
      },
    });
    console.log("✅ Создана региональная организация Москвы");

    // Создаём ППО под региональной
    await prisma.organization.create({
      data: {
        name: "ППО Больница №1",
        type: "PRIMARY",
        parentId: regionalMoscow.id,
        level: 2,
        sortOrder: 1,
        fullPath: "Профсоюз работников здравоохранения РФ / Региональная организация Москвы / ППО Больница №1",
        isActive: true,
      },
    });
    console.log("✅ Создана ППО Больница №1");

    await prisma.organization.create({
      data: {
        name: "ППО Поликлиника №5",
        type: "PRIMARY",
        parentId: regionalMoscow.id,
        level: 2,
        sortOrder: 2,
        fullPath: "Профсоюз работников здравоохранения РФ / Региональная организация Москвы / ППО Поликлиника №5",
        isActive: true,
      },
    });
    console.log("✅ Создана ППО Поликлиника №5");

    // Статистика
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
        "Первичных (ППО)";
      console.log(`   ${typeName}: ${item._count}`);
    });

    console.log("\n✅ Тестовые организации созданы!");
    console.log("💡 Теперь в анкете будет отображаться 7 ППО для выбора\n");
  } catch (error: any) {
    if (error.code === "P2002") {
      console.error("❌ Ошибка: Организация с таким ИНН уже существует");
      console.log("💡 Возможно, данные уже загружены. Удалите их командой:");
      console.log("   pnpm prisma studio");
      console.log("   или запустите: pnpm prisma migrate reset\n");
    } else {
      console.error("❌ Ошибка:", error.message);
    }
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

