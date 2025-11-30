import { prisma } from "../lib/prisma";
import { isProfileComplete } from "../lib/profile-extraction";
import { normalizePhone } from "../lib/utils/phone";

const phone = process.argv[2];

if (!phone) {
  console.error("❌ Укажите номер телефона: pnpm tsx scripts/generate-docs-for-user.ts +79032911816");
  process.exit(1);
}

async function generateDocuments() {
  try {
    const normalizedPhone = normalizePhone(phone);
    console.log(`\n🔍 Ищем пользователя с номером: ${phone} (нормализованный: ${normalizedPhone})\n`);

    // Ищем пользователя
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { phone: phone },
          { authPhone: normalizedPhone },
          { authPhone: phone },
        ],
      },
      include: {
        organization: true,
      },
    });

    if (!user) {
      console.log("❌ Пользователь не найден!");
      process.exit(1);
    }

    console.log(`✅ Пользователь найден: ${user.firstName} ${user.lastName} (${user.email})\n`);

    // Проверяем полноту профиля
    if (!isProfileComplete(user)) {
      console.log("❌ Профиль не заполнен полностью! Нельзя генерировать документы.");
      process.exit(1);
    }

    console.log("✅ Профиль заполнен полностью\n");

    // Проверяем существующие документы
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });

    if (existingDocs.length > 0) {
      console.log("⚠️  У пользователя уже есть документы:");
      existingDocs.forEach((doc) => {
        console.log(`   - ${doc.type}: ${doc.status}`);
      });
      console.log("\n💡 Документы будут перегенерированы\n");
    }

    // Генерируем документы
    console.log("📄 Генерируем документы...\n");

    const { generateMembershipApplication, generateContributionsApplication } = await import("../lib/documents");
    const fs = await import("fs/promises");
    const pathModule = await import("path");

    const ppoChairman = user.organization?.chairmanName || "Председатель ППО";
    const orgName = user.organization?.name || user.organizationName || "";

    console.log("   Генерируем заявление о вступлении...");
    const membershipPath = await generateMembershipApplication(user, ppoChairman);
    console.log(`   ✅ Создано: ${membershipPath}`);

    console.log("   Генерируем заявление о взносах...");
    const contributionsPath = await generateContributionsApplication(user, orgName, undefined);
    console.log(`   ✅ Создано: ${contributionsPath}\n`);

    // Получаем размеры файлов
    const membershipStats = await fs.stat(pathModule.join(process.cwd(), "public", membershipPath));
    const contributionsStats = await fs.stat(pathModule.join(process.cwd(), "public", contributionsPath));

    // Создаем или обновляем документы в БД
    const existingMembership = existingDocs.find((d) => d.type === "MEMBERSHIP_APPLICATION");
    if (existingMembership) {
      await prisma.document.update({
        where: { id: existingMembership.id },
        data: {
          filePath: membershipPath,
          fileName: pathModule.basename(membershipPath),
          fileSize: membershipStats.size,
          status: "GENERATED",
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
        },
      });
      console.log("   ✅ Обновлено заявление о вступлении в БД");
    } else {
      await prisma.document.create({
        data: {
          userId: user.id,
          type: "MEMBERSHIP_APPLICATION",
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          filePath: membershipPath,
          fileName: pathModule.basename(membershipPath),
          fileSize: membershipStats.size,
          mimeType: "application/pdf",
          organizationId: user.organizationId || null,
        },
      });
      console.log("   ✅ Создано заявление о вступлении в БД");
    }

    const existingContributions = existingDocs.find((d) => d.type === "CONTRIBUTION_APPLICATION");
    if (existingContributions) {
      await prisma.document.update({
        where: { id: existingContributions.id },
        data: {
          filePath: contributionsPath,
          fileName: pathModule.basename(contributionsPath),
          fileSize: contributionsStats.size,
          status: "GENERATED",
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
        },
      });
      console.log("   ✅ Обновлено заявление о взносах в БД");
    } else {
      await prisma.document.create({
        data: {
          userId: user.id,
          type: "CONTRIBUTION_APPLICATION",
          status: "GENERATED",
          title: "Заявление о взносах",
          filePath: contributionsPath,
          fileName: pathModule.basename(contributionsPath),
          fileSize: contributionsStats.size,
          mimeType: "application/pdf",
          organizationId: user.organizationId || null,
        },
      });
      console.log("   ✅ Создано заявление о взносах в БД");
    }

    // Обновляем статус пользователя
    await prisma.user.update({
      where: { id: user.id },
      data: {
        membershipStatus: "DOCUMENTS_PENDING",
      },
    });
    console.log("   ✅ Обновлен статус пользователя: DOCUMENTS_PENDING\n");

    // Отправляем системные сообщения
    console.log("💬 Отправляем системные сообщения...");
    const { SystemMessages } = await import("../lib/system-messages");

    const generatedDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
        status: "GENERATED",
      },
      select: { type: true, title: true, filePath: true },
    });

    await SystemMessages.documentsGenerated(user.id, generatedDocs);
    console.log("   ✅ Сообщение о генерации документов отправлено");

    await SystemMessages.uploadDocumentsInstruction(user.id);
    console.log("   ✅ Инструкция по загрузке отправлена\n");

    console.log("✅ ГОТОВО! Документы успешно сгенерированы и сохранены.\n");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    if (error instanceof Error) {
      console.error("   Сообщение:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

generateDocuments();

