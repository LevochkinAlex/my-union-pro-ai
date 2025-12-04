import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Очищает старые документы пользователя, оставляя только актуальные
 * Актуальными считаются:
 * - Документы со статусом PENDING, APPROVED, SIGNED (если есть signedFilePath)
 * - Для каждого типа (MEMBERSHIP_APPLICATION, CONTRIBUTION_APPLICATION) - только самый последний документ со статусом GENERATED
 * - Все документы типа OTHER со статусом GENERATED удаляются
 */
async function cleanupOldDocuments(userId) {
  console.log(`\n🧹 Очистка старых документов для пользователя: ${userId}\n`);

  // Получаем все документы пользователя
  const allDocuments = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Всего документов: ${allDocuments.length}`);

  // Группируем по типам
  const byType = {
    MEMBERSHIP_APPLICATION: [],
    CONTRIBUTION_APPLICATION: [],
    OTHER: [],
  };

  allDocuments.forEach((doc) => {
    if (byType[doc.type]) {
      byType[doc.type].push(doc);
    } else {
      byType.OTHER.push(doc);
    }
  });

  const documentsToDelete = [];

  // Для MEMBERSHIP_APPLICATION и CONTRIBUTION_APPLICATION
  for (const type of ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"]) {
    const docs = byType[type] || [];
    console.log(`\n📄 ${type}: ${docs.length} документов`);

    // Находим актуальные документы (PENDING, APPROVED, или SIGNED с signedFilePath)
    const activeDocs = docs.filter(
      (doc) =>
        doc.status === "PENDING" ||
        doc.status === "APPROVED" ||
        (doc.status === "SIGNED" && doc.signedFilePath)
    );

    // Находим последний документ со статусом GENERATED (если нет активных)
    const lastGenerated =
      activeDocs.length === 0
        ? docs.find((doc) => doc.status === "GENERATED")
        : null;

    // Документы, которые нужно сохранить
    const keepIds = new Set();
    activeDocs.forEach((doc) => keepIds.add(doc.id));
    if (lastGenerated) keepIds.add(lastGenerated.id);

    // Все остальные - на удаление
    docs.forEach((doc) => {
      if (!keepIds.has(doc.id)) {
        documentsToDelete.push(doc);
        console.log(
          `  ❌ Удалить: ${doc.id} (${doc.status}, создан: ${doc.createdAt})`
        );
      } else {
        console.log(
          `  ✅ Сохранить: ${doc.id} (${doc.status}${
            doc.signedFilePath ? ", подписан" : ""
          })`
        );
      }
    });
  }

  // Для типа OTHER - удаляем все со статусом GENERATED
  const otherDocs = byType.OTHER || [];
  console.log(`\n📄 OTHER: ${otherDocs.length} документов`);
  otherDocs.forEach((doc) => {
    if (doc.status === "GENERATED" || doc.status === "DRAFT") {
      documentsToDelete.push(doc);
      console.log(
        `  ❌ Удалить: ${doc.id} (${doc.status}, создан: ${doc.createdAt})`
      );
    } else {
      console.log(`  ✅ Сохранить: ${doc.id} (${doc.status})`);
    }
  });

  // Удаляем документы
  if (documentsToDelete.length > 0) {
    console.log(
      `\n🗑️  Удаление ${documentsToDelete.length} старых документов...`
    );
    const deleteResult = await prisma.document.deleteMany({
      where: {
        id: { in: documentsToDelete.map((d) => d.id) },
      },
    });
    console.log(`✅ Удалено документов: ${deleteResult.count}`);
  } else {
    console.log(`\n✅ Нет документов для удаления`);
  }

  // Показываем итоговое состояние
  const remainingDocs = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n📊 Итоговое количество документов: ${remainingDocs.length}`);
  remainingDocs.forEach((doc) => {
    console.log(
      `  - ${doc.type} (${doc.status}${
        doc.signedFilePath ? ", подписан" : ""
      }): ${doc.fileName || "нет файла"}`
    );
  });
}

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.error("❌ Укажите ID пользователя");
    console.log("Использование: node scripts/cleanup-old-documents.mjs <userId>");
    process.exit(1);
  }

  try {
    await cleanupOldDocuments(userId);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

