import { PrismaClient, OrganizationType } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Скрипт для заполнения начальных данных организаций
 * Использует известные данные и придумывает недостающие
 */
async function seedOrganizations() {
  console.log("🌳 Начало заполнения организаций...\n");

  try {
    // 1. Создаем федеральную организацию (корень)
    let federal = await prisma.organization.findFirst({
      where: { name: "МООП РЗ РФ", type: OrganizationType.FEDERAL },
    });

    if (!federal) {
      federal = await prisma.organization.create({
        data: {
          name: "МООП РЗ РФ",
          type: OrganizationType.FEDERAL,
          level: 0,
          sortOrder: 1,
          fullPath: "МООП РЗ РФ",
          chairmanName: "Еременко Виталий Николаевич",
          chairmanJobTitle: "Председатель",
          isActive: true,
        },
      });
    } else {
      // Обновляем данные, если организация уже существует
      federal = await prisma.organization.update({
        where: { id: federal.id },
        data: {
          chairmanName: "Еременко Виталий Николаевич",
          chairmanJobTitle: "Председатель",
        },
      });
    }

    console.log("✅ Создана федеральная организация:", federal.name);

    // 2. Создаем региональные отделения (примеры)
    const regionalOrgs = [
      {
        name: "Московское региональное отделение",
        chairmanName: "Петров Петр Петрович",
        chairmanJobTitle: "Председатель регионального отделения",
        inn: "7700000001",
        address: "г. Москва, ул. Примерная, д. 1",
        phone: "+7 (495) 123-45-67",
        email: "moscow@moop-rz.ru",
      },
      {
        name: "Санкт-Петербургское региональное отделение",
        chairmanName: "Сидоров Сидор Сидорович",
        chairmanJobTitle: "Председатель регионального отделения",
        inn: "7800000001",
        address: "г. Санкт-Петербург, ул. Примерная, д. 2",
        phone: "+7 (812) 123-45-67",
        email: "spb@moop-rz.ru",
      },
      {
        name: "Московская областная организация профсоюза работников здравоохранения РФ",
        chairmanName: "Кузнецов Кузьма Кузьмич",
        chairmanJobTitle: "Председатель регионального отделения",
        inn: "5000000001",
        address: "Московская область, г. Подольск, ул. Примерная, д. 3",
        phone: "+7 (496) 123-45-67",
        email: "mo@moop-rz.ru",
      },
    ];

    for (const [index, regData] of regionalOrgs.entries()) {
      let regional = regData.inn
        ? await prisma.organization.findFirst({
            where: { inn: regData.inn },
          })
        : await prisma.organization.findFirst({
            where: { name: regData.name, type: OrganizationType.REGIONAL },
          });

      if (!regional) {
        regional = await prisma.organization.create({
          data: {
            name: regData.name,
            type: OrganizationType.REGIONAL,
            parentId: federal.id,
            level: 1,
            sortOrder: index + 1,
            fullPath: `${federal.name} / ${regData.name}`,
            chairmanName: regData.chairmanName,
            chairmanJobTitle: regData.chairmanJobTitle,
            inn: regData.inn,
            address: regData.address,
            phone: regData.phone,
            email: regData.email,
            isActive: true,
          },
        });
      } else {
        regional = await prisma.organization.update({
          where: { id: regional.id },
          data: {
            parentId: federal.id,
            level: 1,
            fullPath: `${federal.name} / ${regData.name}`,
            chairmanName: regData.chairmanName,
            chairmanJobTitle: regData.chairmanJobTitle,
            inn: regData.inn,
            address: regData.address,
            phone: regData.phone,
            email: regData.email,
          },
        });
      }

      console.log(`✅ Создано региональное отделение: ${regional.name}`);
    }

    // 3. Создаем ППО (первичные профсоюзные организации)
    const ppoOrgs = [
      {
        name: 'ППО Аппарат МООП РЗ РФ',
        parentName: "МООП РЗ РФ",
        chairmanName: "Еременко Виталий Николаевич",
        chairmanJobTitle: "Председатель ППО",
        inn: "7700000002",
        address: "г. Москва, ул. Примерная, д. 10",
        phone: "+7 (495) 123-45-68",
        email: "apparat@moop-rz.ru",
      },
      {
        name: 'ППО ГБУЗ МО "МОССМП"',
        parentName: "Московская областная организация профсоюза работников здравоохранения РФ",
        chairmanName: "Сульдин Алексей Михайлович",
        chairmanJobTitle: "Председатель",
        inn: "5000000002",
        address: "Московская область, г. Подольск, ул. Медицинская, д. 1",
        phone: "+7 (496) 123-45-68",
        email: "mossmp@moop-rz.ru",
      },
      {
        name: 'ППО ГБУЗ "Городская больница №1"',
        parentName: "Московское региональное отделение",
        chairmanName: "Иванова Ирина Ивановна",
        chairmanJobTitle: "Председатель ППО",
        inn: "7700000003",
        address: "г. Москва, ул. Больничная, д. 5",
        phone: "+7 (495) 123-45-69",
        email: "gb1@moop-rz.ru",
      },
      {
        name: 'ППО ГБУЗ "Городская поликлиника №2"',
        parentName: "Московское региональное отделение",
        chairmanName: "Смирнов Сергей Сергеевич",
        chairmanJobTitle: "Председатель ППО",
        inn: "7700000004",
        address: "г. Москва, ул. Поликлиническая, д. 10",
        phone: "+7 (495) 123-45-70",
        email: "gp2@moop-rz.ru",
      },
      {
        name: 'ППО ГБУЗ "Санкт-Петербургская больница"',
        parentName: "Санкт-Петербургское региональное отделение",
        chairmanName: "Васильева Василиса Васильевна",
        chairmanJobTitle: "Председатель ППО",
        inn: "7800000002",
        address: "г. Санкт-Петербург, ул. Больничная, д. 15",
        phone: "+7 (812) 123-45-68",
        email: "spb-hospital@moop-rz.ru",
      },
    ];

    for (const [index, ppoData] of ppoOrgs.entries()) {
      // Находим родительскую организацию
      const parent = await prisma.organization.findFirst({
        where: { name: ppoData.parentName },
      });

      if (!parent) {
        console.warn(`⚠️  Родительская организация "${ppoData.parentName}" не найдена для ППО "${ppoData.name}"`);
        continue;
      }

      let ppo = ppoData.inn
        ? await prisma.organization.findFirst({
            where: { inn: ppoData.inn },
          })
        : await prisma.organization.findFirst({
            where: { name: ppoData.name, type: OrganizationType.PRIMARY },
          });

      if (!ppo) {
        ppo = await prisma.organization.create({
          data: {
            name: ppoData.name,
            type: OrganizationType.PRIMARY,
            parentId: parent.id,
            level: parent.level + 1,
            sortOrder: index + 1,
            fullPath: `${parent.fullPath} / ${ppoData.name}`,
            chairmanName: ppoData.chairmanName,
            chairmanJobTitle: ppoData.chairmanJobTitle,
            inn: ppoData.inn,
            address: ppoData.address,
            phone: ppoData.phone,
            email: ppoData.email,
            isActive: true,
          },
        });
      } else {
        ppo = await prisma.organization.update({
          where: { id: ppo.id },
          data: {
            parentId: parent.id,
            level: parent.level + 1,
            fullPath: `${parent.fullPath} / ${ppoData.name}`,
            chairmanName: ppoData.chairmanName,
            chairmanJobTitle: ppoData.chairmanJobTitle,
            inn: ppoData.inn,
            address: ppoData.address,
            phone: ppoData.phone,
            email: ppoData.email,
          },
        });
      }

      console.log(`✅ Создана ППО: ${ppo.name}`);
    }

    console.log("\n✅ Заполнение организаций завершено!\n");

    // Выводим статистику
    const stats = await prisma.organization.groupBy({
      by: ["type"],
      _count: {
        id: true,
      },
    });

    console.log("📊 Статистика:");
    stats.forEach((stat) => {
      const typeName =
        stat.type === OrganizationType.FEDERAL
          ? "Федерация"
          : stat.type === OrganizationType.REGIONAL
          ? "Региональные"
          : "ППО";
      console.log(`   ${typeName}: ${stat._count.id}`);
    });

    const total = await prisma.organization.count();
    console.log(`   Всего: ${total}\n`);
  } catch (error) {
    console.error("❌ Ошибка при заполнении организаций:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedOrganizations().catch(console.error);
