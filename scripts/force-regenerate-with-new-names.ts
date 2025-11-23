import { PrismaClient } from "@prisma/client";
import { generateMembershipApplication, generateContributionsApplication, ensureDocumentsDir } from "@/lib/documents";
import { declineNameToGenitive } from "@/lib/dadata";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function forceRegenerateDocuments(email: string) {
  try {
    await ensureDocumentsDir();
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user) {
      console.log("❌ Пользователь не найден");
      return;
    }

    console.log(`\n📄 Принудительная регенерация документов для: ${user.firstName} ${user.lastName} ${user.middleName}`);
    
    // Сначала проверим склонение
    console.log("\n🧪 Тест склонения:");
    const testGenitive = await declineNameToGenitive(
      user.lastName || "",
      user.firstName || "",
      user.middleName
    );
    console.log(`  Исходное ФИО: ${user.lastName} ${user.firstName} ${user.middleName}`);
    console.log(`  Родительный падеж: ${testGenitive}`);
    console.log(`  Должность: работающего(ей) ${user.jobTitle}`);
    
    // Удаляем старые файлы
    console.log("\n🗑️  Удаление старых файлов...");
    const oldDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });

    for (const doc of oldDocs) {
      try {
        if (doc.filePath) {
          const filePath = path.join(process.cwd(), "public", doc.filePath);
          await fs.unlink(filePath);
          console.log(`  ✅ Удален: ${doc.filePath}`);
        }
      } catch (error) {
        console.log(`  ⚠️  Файл уже удален или не существует: ${doc.filePath}`);
      }
    }

    // Генерируем новые PDF файлы
    console.log("\n🔄 Генерирую новые документы...");
    const membershipPath = await generateMembershipApplication(user);
    console.log(`✅ Заявление о вступлении: ${membershipPath}`);

    const contributionsPath = await generateContributionsApplication(
      user,
      user.organization?.name,
      undefined
    );
    console.log(`✅ Заявление о взносах: ${contributionsPath}`);

    // Получаем размеры файлов
    const membershipStats = await fs.stat(path.join(process.cwd(), "public", membershipPath));
    const contributionsStats = await fs.stat(path.join(process.cwd(), "public", contributionsPath));

    // Обновляем документы в БД
    console.log("\n💾 Обновление БД...");
    
    const existingMembership = oldDocs.find(d => d.type === "MEMBERSHIP_APPLICATION");
    if (existingMembership) {
      await prisma.document.update({
        where: { id: existingMembership.id },
        data: {
          filePath: membershipPath,
          fileName: path.basename(membershipPath),
          fileSize: membershipStats.size,
          status: "GENERATED",
          signedFilePath: null,
          updatedAt: new Date(),
        },
      });
      console.log("✅ Заявление о вступлении обновлено");
    }

    const existingContributions = oldDocs.find(d => d.type === "CONTRIBUTION_APPLICATION");
    if (existingContributions) {
      await prisma.document.update({
        where: { id: existingContributions.id },
        data: {
          filePath: contributionsPath,
          fileName: path.basename(contributionsPath),
          fileSize: contributionsStats.size,
          status: "GENERATED",
          signedFilePath: null,
          updatedAt: new Date(),
        },
      });
      console.log("✅ Заявление о взносах обновлено");
    }

    console.log("\n✅ ГОТОВО! Документы полностью перегенерированы.");
    console.log("\n📋 Проверьте документы:");
    console.log(`  1. Перезагрузите страницу с документами (Ctrl+F5)`);
    console.log(`  2. Скачайте заявление заново`);
    console.log(`  3. В заявлении должно быть: "от ${testGenitive}. работающего(ей) ${user.jobTitle}"`);

  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

forceRegenerateDocuments("ceo@yappix.ru");

