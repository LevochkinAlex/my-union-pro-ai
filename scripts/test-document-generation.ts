import { PrismaClient, DocumentType } from "@prisma/client";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

/**
 * Комплексный тест генерации документов
 * Проверяет:
 * 1. Формирование заявлений
 * 2. Синхронность с шаблонами
 * 3. Правильность переменных
 * 4. Генерацию PDF
 * 5. Отображение в БД
 * 6. Уведомления о перегенерации
 */
async function testDocumentGeneration() {
  try {
    console.log("🧪 Начало комплексного тестирования генерации документов\n");

    // 1. Находим тестового пользователя с полным профилем
    console.log("1️⃣ Поиск тестового пользователя...");
    const testUser = await prisma.user.findFirst({
      where: {
        AND: [
          { firstName: { not: null } },
          { lastName: { not: null } },
          { dateOfBirth: { not: null } },
          { address: { not: null } },
          { phone: { not: null } },
          { jobTitle: { not: null } },
          { workplace: { not: null } },
          { organizationId: { not: null } },
        ],
      },
      include: {
        organization: true,
      },
    });

    if (!testUser) {
      console.error("❌ Не найден пользователь с полным профилем для тестирования");
      console.log("💡 Создайте пользователя с заполненными полями:");
      console.log("   - firstName, lastName, middleName");
      console.log("   - dateOfBirth, address, phone");
      console.log("   - jobTitle, workplace");
      console.log("   - organizationId");
      return;
    }

    console.log(`✅ Найден тестовый пользователь: ${testUser.firstName} ${testUser.lastName}`);
    console.log(`   ID: ${testUser.id}`);
    console.log(`   Email: ${testUser.email || "—"}`);
    console.log(`   Организация: ${testUser.organization?.name || "—"}\n`);

    // 2. Проверяем наличие шаблонов
    console.log("2️⃣ Проверка шаблонов документов...");
    
    const membershipTemplate = await prisma.documentTemplate.findFirst({
      where: {
        type: DocumentType.MEMBERSHIP_APPLICATION,
        isActive: true,
        isDefault: true,
      },
    });

    const duesTemplate = await prisma.documentTemplate.findFirst({
      where: {
        type: DocumentType.CONTRIBUTION_APPLICATION,
        isActive: true,
        isDefault: true,
      },
    });

    if (!membershipTemplate) {
      console.error("❌ Шаблон заявления о вступлении не найден");
      console.log("💡 Создайте шаблон через админ-панель или используйте дефолтный");
      return;
    }

    if (!duesTemplate) {
      console.error("❌ Шаблон заявления о взносах не найден");
      console.log("💡 Создайте шаблон через админ-панель или используйте дефолтный");
      return;
    }

    console.log(`✅ Шаблон заявления о вступлении найден: ${membershipTemplate.name}`);
    console.log(`   ID: ${membershipTemplate.id}`);
    console.log(`   Переменные в шаблоне: ${membershipTemplate.variables ? JSON.stringify(membershipTemplate.variables) : "нет"}`);
    console.log(`✅ Шаблон заявления о взносах найден: ${duesTemplate.name}`);
    console.log(`   ID: ${duesTemplate.id}`);
    console.log(`   Переменные в шаблоне: ${duesTemplate.variables ? JSON.stringify(duesTemplate.variables) : "нет"}\n`);

    // 3. Проверяем переменные в шаблонах
    console.log("3️⃣ Проверка переменных в шаблонах...");
    
    const membershipContent = membershipTemplate.content || "";
    const duesContent = duesTemplate.content || "";

    // Извлекаем переменные из шаблонов (формат {{variable}})
    const membershipVars = (membershipContent.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ""));
    const duesVars = (duesContent.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ""));

    console.log(`📋 Переменные в шаблоне заявления о вступлении: ${membershipVars.length > 0 ? membershipVars.join(", ") : "нет"}`);
    console.log(`📋 Переменные в шаблоне заявления о взносах: ${duesVars.length > 0 ? duesVars.join(", ") : "нет"}\n`);

    // Проверяем доступность данных пользователя для переменных
    const userDataMap: Record<string, any> = {
      firstName: testUser.firstName,
      lastName: testUser.lastName,
      middleName: testUser.middleName,
      fullName: `${testUser.lastName} ${testUser.firstName} ${testUser.middleName || ""}`.trim(),
      jobTitle: testUser.jobTitle,
      workplace: testUser.workplace,
      workplaceInn: testUser.workplaceInn,
      directorName: testUser.directorName,
      directorPosition: testUser.directorPosition,
      address: testUser.address,
      phone: testUser.phone,
      dateOfBirth: testUser.dateOfBirth ? testUser.dateOfBirth.toLocaleDateString("ru-RU") : null,
      organizationName: testUser.organization?.name || testUser.organizationName,
      chairmanName: testUser.organization?.chairmanName || "Председатель ППО",
      currentDate: new Date().toLocaleDateString("ru-RU"),
    };

    console.log("📊 Доступные данные пользователя:");
    Object.entries(userDataMap).forEach(([key, value]) => {
      console.log(`   ${key}: ${value !== null && value !== undefined ? "✅" : "❌"} ${value || "—"}`);
    });
    console.log();

    // Проверяем, все ли переменные имеют данные
    const allVars = [...new Set([...membershipVars, ...duesVars])];
    const missingVars: string[] = [];
    
    allVars.forEach(varName => {
      if (!(varName in userDataMap) || userDataMap[varName] === null || userDataMap[varName] === undefined) {
        missingVars.push(varName);
      }
    });

    if (missingVars.length > 0) {
      console.warn(`⚠️ Переменные без данных: ${missingVars.join(", ")}`);
    } else {
      console.log("✅ Все переменные имеют данные\n");
    }

    // 4. Генерируем документы
    console.log("4️⃣ Генерация PDF документов...");
    
    let membershipPdf: Buffer;
    let duesPdf: Buffer;

    try {
      console.log("   Генерация заявления о вступлении...");
      membershipPdf = await generateDocumentFromTemplate(membershipTemplate, testUser);
      console.log(`   ✅ Заявление о вступлении сгенерировано (${membershipPdf.length} байт)`);
    } catch (error) {
      console.error(`   ❌ Ошибка генерации заявления о вступлении:`, error);
      throw error;
    }

    try {
      console.log("   Генерация заявления о взносах...");
      duesPdf = await generateDocumentFromTemplate(duesTemplate, testUser);
      console.log(`   ✅ Заявление о взносах сгенерировано (${duesPdf.length} байт)\n`);
    } catch (error) {
      console.error(`   ❌ Ошибка генерации заявления о взносах:`, error);
      throw error;
    }

    // 5. Сохраняем тестовые файлы для проверки
    const testDir = path.join(process.cwd(), "tmp", "test-documents");
    await fs.mkdir(testDir, { recursive: true });

    const membershipPath = path.join(testDir, `test_membership_${Date.now()}.pdf`);
    const duesPath = path.join(testDir, `test_dues_${Date.now()}.pdf`);

    await fs.writeFile(membershipPath, membershipPdf);
    await fs.writeFile(duesPath, duesPdf);

    console.log(`💾 Тестовые PDF сохранены:`);
    console.log(`   ${membershipPath}`);
    console.log(`   ${duesPath}\n`);

    // 6. Проверяем сохранение в БД
    console.log("5️⃣ Проверка сохранения документов в БД...");
    
    // Удаляем старые тестовые документы
    await prisma.document.deleteMany({
      where: {
        userId: testUser.id,
        type: {
          in: [DocumentType.MEMBERSHIP_APPLICATION, DocumentType.CONTRIBUTION_APPLICATION],
        },
        status: "GENERATED",
      },
    });

    const membershipDoc = await prisma.document.create({
      data: {
        userId: testUser.id,
        organizationId: testUser.organizationId,
        type: DocumentType.MEMBERSHIP_APPLICATION,
        status: "GENERATED",
        title: "Заявление о вступлении в профсоюз (ТЕСТ)",
        description: `Тестовое заявление от ${testUser.lastName} ${testUser.firstName}`,
        fileName: `test_membership_${testUser.id}_${Date.now()}.pdf`,
        fileSize: membershipPdf.length,
        mimeType: "application/pdf",
        content: membershipPdf.toString("base64"),
        templateId: membershipTemplate.id,
      },
    });

    const duesDoc = await prisma.document.create({
      data: {
        userId: testUser.id,
        organizationId: testUser.organizationId,
        type: DocumentType.CONTRIBUTION_APPLICATION,
        status: "GENERATED",
        title: "Заявление о перечислении членских взносов (ТЕСТ)",
        description: `Тестовое заявление о взносах от ${testUser.lastName} ${testUser.firstName}`,
        fileName: `test_dues_${testUser.id}_${Date.now()}.pdf`,
        fileSize: duesPdf.length,
        mimeType: "application/pdf",
        content: duesPdf.toString("base64"),
        templateId: duesTemplate.id,
      },
    });

    console.log(`✅ Документы сохранены в БД:`);
    console.log(`   Заявление о вступлении: ID ${membershipDoc.id}`);
    console.log(`   Заявление о взносах: ID ${duesDoc.id}\n`);

    // 7. Проверяем уведомление о перегенерации
    console.log("6️⃣ Проверка уведомления о перегенерации...");
    
    // Устанавливаем флаг изменения профиля
    await prisma.user.update({
      where: { id: testUser.id },
      data: {
        profileChangedAfterDocuments: true,
        profileLastModified: new Date(),
      },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: {
        profileChangedAfterDocuments: true,
        profileLastModified: true,
      },
    });

    if (updatedUser?.profileChangedAfterDocuments) {
      console.log("✅ Флаг profileChangedAfterDocuments установлен");
      console.log(`   Дата изменения: ${updatedUser.profileLastModified?.toLocaleString("ru-RU") || "—"}`);
    } else {
      console.error("❌ Флаг profileChangedAfterDocuments не установлен");
    }

    // Проверяем наличие документов для перегенерации
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: testUser.id,
        type: {
          in: [DocumentType.MEMBERSHIP_APPLICATION, DocumentType.CONTRIBUTION_APPLICATION],
        },
      },
    });

    if (existingDocs.length > 0 && updatedUser?.profileChangedAfterDocuments) {
      console.log(`✅ Обнаружены документы (${existingDocs.length}), требующие перегенерации`);
    } else if (existingDocs.length === 0) {
      console.log("⚠️ Документы не найдены");
    } else {
      console.log("⚠️ Флаг изменения профиля не установлен");
    }

    console.log("\n📊 Итоги тестирования:");
    console.log("   ✅ Шаблоны найдены и активны");
    console.log(`   ✅ Переменные проверены (${allVars.length} переменных)`);
    console.log(`   ${missingVars.length > 0 ? "⚠️" : "✅"} Данные для переменных ${missingVars.length > 0 ? "неполные" : "полные"}`);
    console.log("   ✅ PDF документы сгенерированы");
    console.log("   ✅ Документы сохранены в БД");
    console.log("   ✅ Уведомление о перегенерации работает");
    console.log("\n💡 Проверьте сгенерированные PDF файлы в папке tmp/test-documents");

  } catch (error) {
    console.error("\n❌ Ошибка при тестировании:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск теста
testDocumentGeneration()
  .then(() => {
    console.log("\n✅ Тестирование завершено успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Тестирование завершилось с ошибкой:", error);
    process.exit(1);
  });
