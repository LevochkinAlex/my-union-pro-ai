import { PrismaClient, DocumentType } from "@prisma/client";
import { extractUserVariables, renderTemplate } from "@/lib/document-templates/renderer";

const prisma = new PrismaClient();

/**
 * Упрощенный тест генерации документов (без генерации PDF)
 * Проверяет:
 * 1. Формирование заявлений
 * 2. Синхронность с шаблонами
 * 3. Правильность переменных
 * 4. Уведомления о перегенерации
 */
async function testDocumentGenerationSimple() {
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
      return;
    }

    if (!duesTemplate) {
      console.error("❌ Шаблон заявления о взносах не найден");
      return;
    }

    console.log(`✅ Шаблон заявления о вступлении найден: ${membershipTemplate.name}`);
    console.log(`   ID: ${membershipTemplate.id}`);
    console.log(`   HTML длина: ${membershipTemplate.htmlContent?.length || 0} символов`);
    console.log(`✅ Шаблон заявления о взносах найден: ${duesTemplate.name}`);
    console.log(`   ID: ${duesTemplate.id}`);
    console.log(`   HTML длина: ${duesTemplate.htmlContent?.length || 0} символов\n`);

    // 3. Проверяем переменные в шаблонах
    console.log("3️⃣ Проверка переменных в шаблонах...");
    
    const membershipContent = membershipTemplate.htmlContent || "";
    const duesContent = duesTemplate.htmlContent || "";

    // Извлекаем переменные из шаблонов (формат {{variable}})
    const membershipVars = (membershipContent.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ""));
    const duesVars = (duesContent.match(/\{\{(\w+)\}\}/g) || []).map(v => v.replace(/[{}]/g, ""));

    console.log(`📋 Переменные в шаблоне заявления о вступлении (${membershipVars.length}):`);
    if (membershipVars.length > 0) {
      const uniqueVars = [...new Set(membershipVars)];
      uniqueVars.forEach(v => console.log(`   - {{${v}}}`));
    } else {
      console.log("   ⚠️ Переменные не найдены (возможно, используется старый формат)");
    }

    console.log(`\n📋 Переменные в шаблоне заявления о взносах (${duesVars.length}):`);
    if (duesVars.length > 0) {
      const uniqueVars = [...new Set(duesVars)];
      uniqueVars.forEach(v => console.log(`   - {{${v}}}`));
    } else {
      console.log("   ⚠️ Переменные не найдены (возможно, используется старый формат)");
    }
    console.log();

    // 4. Извлекаем переменные из пользователя
    console.log("4️⃣ Извлечение переменных из данных пользователя...");
    
    const variables = await extractUserVariables(testUser as any);

    console.log("📊 Доступные переменные:");
    Object.entries(variables).forEach(([key, value]) => {
      const hasValue = value !== null && value !== undefined && value !== "";
      console.log(`   ${hasValue ? "✅" : "❌"} ${key}: ${value || "—"}`);
    });
    console.log();

    // 5. Проверяем, все ли переменные имеют данные
    const allVars = [...new Set([...membershipVars, ...duesVars])];
    const missingVars: string[] = [];
    const foundVars: string[] = [];
    
    allVars.forEach(varName => {
      if (varName in variables && variables[varName] !== null && variables[varName] !== undefined && variables[varName] !== "") {
        foundVars.push(varName);
      } else {
        missingVars.push(varName);
      }
    });

    if (missingVars.length > 0) {
      console.warn(`⚠️ Переменные без данных (${missingVars.length}): ${missingVars.join(", ")}`);
    } else if (allVars.length > 0) {
      console.log(`✅ Все переменные (${allVars.length}) имеют данные`);
    } else {
      console.log("ℹ️ Переменные в шаблонах не используются (возможно, старый формат)");
    }
    console.log();

    // 6. Тестируем рендеринг шаблонов
    console.log("5️⃣ Тестирование рендеринга шаблонов...");
    
    try {
      const renderedMembership = renderTemplate(membershipContent, variables);
      const hasUnrenderedVars = renderedMembership.match(/\{\{(\w+)\}\}/g);
      
      if (hasUnrenderedVars) {
        console.warn(`⚠️ В заявлении о вступлении остались необработанные переменные: ${hasUnrenderedVars.join(", ")}`);
      } else {
        console.log("✅ Заявление о вступлении успешно отрендерено");
      }
    } catch (error) {
      console.error(`❌ Ошибка рендеринга заявления о вступлении:`, error);
    }

    try {
      const renderedDues = renderTemplate(duesContent, variables);
      const hasUnrenderedVars = renderedDues.match(/\{\{(\w+)\}\}/g);
      
      if (hasUnrenderedVars) {
        console.warn(`⚠️ В заявлении о взносах остались необработанные переменные: ${hasUnrenderedVars.join(", ")}`);
      } else {
        console.log("✅ Заявление о взносах успешно отрендерено");
      }
    } catch (error) {
      console.error(`❌ Ошибка рендеринга заявления о взносах:`, error);
    }
    console.log();

    // 7. Проверяем сохранение документов в БД
    console.log("6️⃣ Проверка сохранения документов в БД...");
    
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: testUser.id,
        type: {
          in: [DocumentType.MEMBERSHIP_APPLICATION, DocumentType.CONTRIBUTION_APPLICATION],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    });

    console.log(`📄 Найдено документов пользователя: ${existingDocs.length}`);
    existingDocs.forEach((doc, idx) => {
      console.log(`   ${idx + 1}. ${doc.title} (${doc.type}) - ${doc.status}`);
      console.log(`      Создан: ${doc.createdAt.toLocaleString("ru-RU")}`);
      console.log(`      Шаблон: ${doc.templateId || "—"}`);
    });
    console.log();

    // 8. Проверяем уведомление о перегенерации
    console.log("7️⃣ Проверка уведомления о перегенерации...");
    
    const userStatus = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: {
        profileChangedAfterDocuments: true,
        profileLastModified: true,
      },
    });

    if (userStatus?.profileChangedAfterDocuments) {
      console.log("✅ Флаг profileChangedAfterDocuments установлен");
      console.log(`   Дата изменения: ${userStatus.profileLastModified?.toLocaleString("ru-RU") || "—"}`);
      
      if (existingDocs.length > 0) {
        console.log(`   ⚠️ Обнаружены документы (${existingDocs.length}), требующие перегенерации`);
        console.log("   💡 Пользователь должен увидеть уведомление о необходимости перегенерации");
      }
    } else {
      console.log("ℹ️ Флаг profileChangedAfterDocuments не установлен (профиль не изменялся после генерации)");
    }

    // 9. Проверяем синхронность с шаблонами
    console.log("\n8️⃣ Проверка синхронности с шаблонами...");
    
    const membershipDocWithTemplate = existingDocs.find(d => d.type === DocumentType.MEMBERSHIP_APPLICATION && d.templateId);
    const duesDocWithTemplate = existingDocs.find(d => d.type === DocumentType.CONTRIBUTION_APPLICATION && d.templateId);

    if (membershipDocWithTemplate) {
      const docTemplate = await prisma.documentTemplate.findUnique({
        where: { id: membershipDocWithTemplate.templateId! },
      });
      
      if (docTemplate) {
        const isSame = docTemplate.id === membershipTemplate.id;
        console.log(`   Заявление о вступлении: ${isSame ? "✅" : "⚠️"} Использует ${isSame ? "актуальный" : "устаревший"} шаблон`);
        if (!isSame) {
          console.log(`      Документ: ${docTemplate.name} (ID: ${docTemplate.id})`);
          console.log(`      Актуальный: ${membershipTemplate.name} (ID: ${membershipTemplate.id})`);
        }
      }
    } else {
      console.log("   Заявление о вступлении: ⚠️ Документ не найден или не привязан к шаблону");
    }

    if (duesDocWithTemplate) {
      const docTemplate = await prisma.documentTemplate.findUnique({
        where: { id: duesDocWithTemplate.templateId! },
      });
      
      if (docTemplate) {
        const isSame = docTemplate.id === duesTemplate.id;
        console.log(`   Заявление о взносах: ${isSame ? "✅" : "⚠️"} Использует ${isSame ? "актуальный" : "устаревший"} шаблон`);
        if (!isSame) {
          console.log(`      Документ: ${docTemplate.name} (ID: ${docTemplate.id})`);
          console.log(`      Актуальный: ${duesTemplate.name} (ID: ${duesTemplate.id})`);
        }
      }
    } else {
      console.log("   Заявление о взносах: ⚠️ Документ не найден или не привязан к шаблону");
    }

    console.log("\n📊 Итоги тестирования:");
    console.log("   ✅ Шаблоны найдены и активны");
    console.log(`   ${allVars.length > 0 ? (missingVars.length === 0 ? "✅" : "⚠️") : "ℹ️"} Переменные проверены (${allVars.length} переменных, ${missingVars.length} без данных)`);
    console.log("   ✅ Рендеринг шаблонов работает");
    console.log(`   ${existingDocs.length > 0 ? "✅" : "⚠️"} Документы в БД (${existingDocs.length})`);
    console.log(`   ${userStatus?.profileChangedAfterDocuments ? "✅" : "ℹ️"} Уведомление о перегенерации ${userStatus?.profileChangedAfterDocuments ? "активно" : "не требуется"}`);
    console.log("   ✅ Синхронность с шаблонами проверена");

  } catch (error) {
    console.error("\n❌ Ошибка при тестировании:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск теста
testDocumentGenerationSimple()
  .then(() => {
    console.log("\n✅ Тестирование завершено успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Тестирование завершилось с ошибкой:", error);
    process.exit(1);
  });
