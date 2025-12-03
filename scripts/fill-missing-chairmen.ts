import { PrismaClient, OrganizationType } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Скрипт для заполнения недостающих председателей организаций
 */
async function fillMissingChairmen() {
  console.log("👥 Заполнение недостающих председателей...\n");

  try {
    // Получаем все организации без председателей
    const organizationsWithoutChairmen = await prisma.organization.findMany({
      where: {
        OR: [
          { chairmanName: null },
          { chairmanName: "" },
        ],
      },
      orderBy: [
        { type: "asc" },
        { level: "asc" },
        { name: "asc" },
      ],
    });

    console.log(`📋 Найдено организаций без председателей: ${organizationsWithoutChairmen.length}\n`);

    if (organizationsWithoutChairmen.length === 0) {
      console.log("✅ Все организации уже имеют председателей!\n");
      return;
    }

    // Словарь для председателей по типам и названиям организаций
    const chairmenData: Record<string, { name: string; jobTitle: string }> = {
      // Региональные отделения
      "Московское региональное отделение": {
        name: "Петров Петр Петрович",
        jobTitle: "Председатель регионального отделения",
      },
      "Санкт-Петербургское региональное отделение": {
        name: "Сидоров Сидор Сидорович",
        jobTitle: "Председатель регионального отделения",
      },
      "Московская областная организация профсоюза работников здравоохранения РФ": {
        name: "Кузнецов Кузьма Кузьмич",
        jobTitle: "Председатель регионального отделения",
      },
      // ППО
      'ППО Аппарат МООП РЗ РФ': {
        name: "Еременко Виталий Николаевич",
        jobTitle: "Председатель ППО",
      },
      'ППО ГБУЗ МО "МОССМП"': {
        name: "Сульдин Алексей Михайлович",
        jobTitle: "Председатель",
      },
    };

    // Генерируем председателей для остальных организаций
    const maleFirstNames = [
      "Александр", "Дмитрий", "Максим", "Сергей", "Андрей", "Алексей", "Артем",
      "Илья", "Кирилл", "Михаил", "Никита", "Матвей", "Роман", "Егор", "Арсений",
      "Иван", "Денис", "Евгений", "Данил", "Тимур", "Владислав", "Игорь", "Владимир",
      "Павел", "Руслан", "Марк", "Лев", "Андрей", "Ярослав", "Федор", "Николай",
      "Степан", "Юрий", "Василий", "Борис", "Геннадий", "Виктор", "Олег", "Константин",
    ];

    const maleLastNames = [
      "Иванов", "Петров", "Сидоров", "Смирнов", "Кузнецов", "Попов", "Соколов",
      "Лебедев", "Козлов", "Новиков", "Морозов", "Петров", "Волков", "Соловьев",
      "Васильев", "Зайцев", "Павлов", "Семенов", "Голубев", "Виноградов", "Богданов",
      "Воробьев", "Федоров", "Михайлов", "Белов", "Тарасов", "Беляев", "Комаров",
      "Орлов", "Киселев", "Макаров", "Андреев", "Ковалев", "Ильин", "Гусев", "Титов",
    ];

    const maleMiddleNames = [
      "Александрович", "Дмитриевич", "Максимович", "Сергеевич", "Андреевич", "Алексеевич",
      "Артемович", "Ильич", "Кириллович", "Михайлович", "Никитич", "Матвеевич", "Романович",
      "Егорович", "Арсеньевич", "Иванович", "Денисович", "Евгеньевич", "Данилович", "Тимурович",
      "Владиславович", "Игоревич", "Владимирович", "Павлович", "Русланович", "Маркович", "Львович",
      "Ярославович", "Федорович", "Николаевич", "Степанович", "Юрьевич", "Васильевич", "Борисович",
      "Геннадьевич", "Викторович", "Олегович", "Константинович",
    ];

    let updatedCount = 0;
    let skippedCount = 0;

    for (const org of organizationsWithoutChairmen) {
      // Проверяем, есть ли данные в словаре
      let chairmanData = chairmenData[org.name];

      // Если нет, генерируем случайные данные
      if (!chairmanData) {
        const firstName = maleFirstNames[Math.floor(Math.random() * maleFirstNames.length)];
        const lastName = maleLastNames[Math.floor(Math.random() * maleLastNames.length)];
        const middleName = maleMiddleNames[Math.floor(Math.random() * maleMiddleNames.length)];

        let jobTitle = "";
        if (org.type === OrganizationType.FEDERAL) {
          jobTitle = "Председатель";
        } else if (org.type === OrganizationType.REGIONAL) {
          jobTitle = "Председатель регионального отделения";
        } else {
          jobTitle = "Председатель ППО";
        }

        chairmanData = {
          name: `${lastName} ${firstName} ${middleName}`,
          jobTitle,
        };
      }

      try {
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            chairmanName: chairmanData.name,
            chairmanJobTitle: chairmanData.jobTitle,
          },
        });

        console.log(`✅ ${org.name}`);
        console.log(`   Председатель: ${chairmanData.name} (${chairmanData.jobTitle})`);
        updatedCount++;
      } catch (error: any) {
        console.error(`❌ Ошибка при обновлении "${org.name}":`, error.message);
        skippedCount++;
      }
    }

    console.log("\n" + "═".repeat(70));
    console.log("📊 ИТОГИ:");
    console.log(`   ✅ Обновлено: ${updatedCount}`);
    console.log(`   ⏭️  Пропущено: ${skippedCount}`);
    console.log("═".repeat(70) + "\n");

    // Выводим статистику по типам
    const stats = await prisma.organization.groupBy({
      by: ["type"],
      where: {
        chairmanName: { not: null },
      },
      _count: {
        id: true,
      },
    });

    console.log("📈 Статистика организаций с председателями:");
    stats.forEach((stat) => {
      const typeName =
        stat.type === OrganizationType.FEDERAL
          ? "Федерация"
          : stat.type === OrganizationType.REGIONAL
          ? "Региональные"
          : "ППО";
      console.log(`   ${typeName}: ${stat._count.id}`);
    });

    const totalWithChairmen = await prisma.organization.count({
      where: {
        chairmanName: { not: null },
      },
    });

    const total = await prisma.organization.count();
    console.log(`\n   Всего с председателями: ${totalWithChairmen} из ${total}\n`);
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fillMissingChairmen().catch(console.error);

