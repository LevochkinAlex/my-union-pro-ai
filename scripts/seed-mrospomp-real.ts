/**
 * Скрипт для заполнения РЕАЛЬНОЙ структуры организаций МРОСПОМП
 * Данные взяты из orgs.png
 * 
 * Запуск: pnpm tsx scripts/seed-mrospomp-real.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Список всех МСЧ из изображения
const mschList = [
  "МСЧ-122", "МСЧ-123", "МСЧ-124", "МСЧ-125", "МСЧ-126",
  "МСЧ-127", "МСЧ-128", "МСЧ-129", "МСЧ-130", "МСЧ-131",
  "МСЧ-132", "МСЧ-135", "МСЧ-138", "МСЧ-156", "МСЧ-158",
  "МСЧ-163", "МСЧ-165", "МСЧ-168", "МСЧ-169", "МСЧ-170",
  "МСЧ-171", "МСЧ-172", "МСЧ-174", "МСЧ-175", "МСЧ-176",
  "МСЧ-178", "МСЧ-179", "МСЧ-180", "МСЧ-181", "МСЧ-182",
  "МСЧ-183", "МСЧ-192", "МСЧ-193", "МСЧ-196", "МСЧ-198",
  "МСЧ-199", "МСЧ-201", "МСЧ-202", "МСЧ-203", "МСЧ-204",
  "МСЧ-205", "МСЧ-206", "МСЧ-207", "МСЧ-208", "МСЧ-209",
  "МСЧ-210", "МСЧ-211", "МСЧ-212", "МСЧ-214", "МСЧ-215",
  "МСЧ-216", "МСЧ-217", "МСЧ-218", "МСЧ-220", "МСЧ-221",
  "МСЧ-222", "МСЧ-223", "МСЧ-224", "МСЧ-225", "МСЧ-227",
  "МСЧ-228", "МСЧ-229", "МСЧ-230", "МСЧ-231", "МСЧ-232",
  "МСЧ-233", "МСЧ-234", "МСЧ-235", "МСЧ-236", "МСЧ-237",
  "МСЧ-238", "МСЧ-239", "МСЧ-240", "МСЧ-241", "МСЧ-242",
  "МСЧ-243", "МСЧ-244", "МСЧ-245", "МСЧ-246", "МСЧ-247",
  "МСЧ-248", "МСЧ-249", "МСЧ-250", "МСЧ-251", "МСЧ-252",
  "МСЧ-253", "МСЧ-254", "МСЧ-255", "МСЧ-256", "МСЧ-257",
  "МСЧ-258", "МСЧ-259", "МСЧ-260", "МСЧ-261", "МСЧ-262",
];

async function main() {
  console.log("🚀 Создаём структуру МРОСПОМП с реальными данными...\n");

  try {
    // Проверяем, есть ли уже организации
    const existingCount = await prisma.organization.count();
    if (existingCount > 0) {
      console.log(`⚠️  В базе уже есть ${existingCount} организаций.`);
      console.log("Очищаем базу...");
      await prisma.organization.deleteMany({});
      console.log("✅ Старые организации удалены\n");
    }

    // Создаём МРОСПОМП (региональная организация)
    const mrospomp = await prisma.organization.create({
      data: {
        name: "МРОСПОМП",
        type: "REGIONAL",
        // level, sortOrder, fullPath будут добавлены после миграции
        inn: "7701016030",
        address: "г. Москва, ул. Новослободская, д. 73/68, стр. 8",
        phone: "+7 (495) 619-39-60",
        email: "info@mrospomp.ru",
        chairmanName: "Боровкова О.И.",
        isActive: true,
      },
    });
    console.log("✅ Создана региональная организация: МРОСПОМП");
    console.log(`   ID: ${mrospomp.id}`);
    console.log(`   ИНН: ${mrospomp.inn}\n`);

    // Создаём все МСЧ (первичные профсоюзные организации)
    console.log(`📋 Создаём ${mschList.length} первичных организаций (ППО)...\n`);
    
    let createdCount = 0;
    for (let i = 0; i < mschList.length; i++) {
      const mschName = mschList[i];
      
      try {
        await prisma.organization.create({
          data: {
            name: mschName,
            type: "PRIMARY",
            parentId: mrospomp.id,
            // level, sortOrder, fullPath будут добавлены после миграции
            isActive: true,
          },
        });
        createdCount++;
        
        // Выводим прогресс каждые 10 организаций
        if ((i + 1) % 10 === 0 || i === mschList.length - 1) {
          console.log(`   ✓ Создано ${createdCount}/${mschList.length} ППО...`);
        }
      } catch (error: any) {
        console.error(`   ❌ Ошибка при создании ${mschName}:`, error.message);
      }
    }

    // Статистика
    const totalCount = await prisma.organization.count();
    const byType = await prisma.organization.groupBy({
      by: ["type"],
      _count: true,
    });

    console.log("\n📊 Итоговая статистика:");
    console.log(`   Всего организаций: ${totalCount}`);
    byType.forEach((item) => {
      const typeName = 
        item.type === "FEDERATION" ? "Федеральных" :
        item.type === "REGIONAL" ? "Региональных" :
        "Первичных (ППО)";
      console.log(`   ${typeName}: ${item._count}`);
    });

    console.log("\n✅ Структура МРОСПОМП успешно создана!");
    console.log(`\n💡 В анкете теперь доступно ${createdCount} ППО для выбора`);
    console.log("🔗 Все организации привязаны к МРОСПОМП\n");
  } catch (error: any) {
    console.error("\n❌ Критическая ошибка:", error.message);
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

