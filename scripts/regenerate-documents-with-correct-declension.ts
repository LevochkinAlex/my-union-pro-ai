import { PrismaClient } from "@prisma/client";
import { generateMembershipApplication, generateContributionsApplication, ensureDocumentsDir } from "@/lib/documents";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function regenerateDocuments(email: string) {
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

    console.log(`\n📄 Генерация документов для: ${user.firstName} ${user.lastName} ${user.middleName}`);

    // Генерируем PDF файлы
    console.log("\n🔄 Генерирую заявление о вступлении...");
    const membershipPath = await generateMembershipApplication(user);
    console.log(`✅ Сгенерировано: ${membershipPath}`);

    console.log("\n🔄 Генерирую заявление о взносах...");
    const contributionsPath = await generateContributionsApplication(
      user,
      user.organization?.name,
      undefined
    );
    console.log(`✅ Сгенерировано: ${contributionsPath}`);

    // Обновляем документы в базе данных
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });

    console.log(`\n📊 Найдено существующих документов: ${existingDocs.length}`);

    // Получаем размеры файлов
    const membershipStats = await fs.stat(path.join(process.cwd(), "public", membershipPath));
    const contributionsStats = await fs.stat(path.join(process.cwd(), "public", contributionsPath));

    // Заявление о вступлении
    const existingMembership = existingDocs.find(d => d.type === "MEMBERSHIP_APPLICATION");
    if (existingMembership) {
      await prisma.document.update({
        where: { id: existingMembership.id },
        data: {
          filePath: membershipPath,
          fileName: path.basename(membershipPath),
          fileSize: membershipStats.size,
          status: "GENERATED",
          signedFilePath: null, // Очищаем подписанный файл
        },
      });
      console.log("✅ Заявление о вступлении обновлено в БД");
    } else {
      await prisma.document.create({
        data: {
          userId: user.id,
          type: "MEMBERSHIP_APPLICATION",
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          filePath: membershipPath,
          fileName: path.basename(membershipPath),
          fileSize: membershipStats.size,
          mimeType: "application/pdf",
          organizationId: user.organizationId || null,
        },
      });
      console.log("✅ Заявление о вступлении создано в БД");
    }

    // Заявление о взносах
    const existingContributions = existingDocs.find(d => d.type === "CONTRIBUTION_APPLICATION");
    if (existingContributions) {
      await prisma.document.update({
        where: { id: existingContributions.id },
        data: {
          filePath: contributionsPath,
          fileName: path.basename(contributionsPath),
          fileSize: contributionsStats.size,
          status: "GENERATED",
          signedFilePath: null, // Очищаем подписанный файл
        },
      });
      console.log("✅ Заявление о взносах обновлено в БД");
    } else {
      await prisma.document.create({
        data: {
          userId: user.id,
          type: "CONTRIBUTION_APPLICATION",
          status: "GENERATED",
          title: "Заявление о взносах",
          filePath: contributionsPath,
          fileName: path.basename(contributionsPath),
          fileSize: contributionsStats.size,
          mimeType: "application/pdf",
          organizationId: user.organizationId || null,
        },
      });
      console.log("✅ Заявление о взносах создано в БД");
    }

    console.log("\n✅ Документы успешно перегенерированы с правильным склонением!");
    console.log("📋 Теперь в документах будет:");
    console.log(`   - Правильное склонение ФИО в родительном падеже`);
    console.log(`   - Приставка "работающего(ей)" к должности`);

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateDocuments("ceo@yappix.ru");

