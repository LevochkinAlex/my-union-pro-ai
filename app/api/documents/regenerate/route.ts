import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMembershipApplication, generateContributionsApplication } from "@/lib/documents";

/**
 * POST /api/documents/regenerate
 * Перегенерирует документы пользователя с актуальными данными профиля
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем пользователя с организацией
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        organization: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Проверяем что профиль заполнен
    const requiredFields = [
      user.firstName,
      user.lastName,
      user.dateOfBirth,
      user.phone,
      user.address,
      user.jobTitle,
      user.profession,
      user.education,
    ];

    if (requiredFields.some((field) => !field)) {
      return NextResponse.json(
        { error: "Профиль не полностью заполнен. Заполните все обязательные поля." },
        { status: 400 }
      );
    }

    console.log("[regenerate-documents] Regenerating documents for user:", user.email);

    // Генерируем новые PDF файлы
    const [membershipPath, contributionsPath] = await Promise.all([
      generateMembershipApplication(user),
      generateContributionsApplication(user, user.organization?.name, undefined),
    ]);

    console.log("[regenerate-documents] PDF files generated:", { membershipPath, contributionsPath });

    // Получаем существующие документы
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
        },
      },
    });
    
    // Удаляем все старые документы того же типа, кроме тех, которые обновляем
    // Это предотвращает накопление дубликатов
    const existingMembership = existingDocs.find((d) => d.type === "MEMBERSHIP_APPLICATION");
    const existingContributions = existingDocs.find((d) => d.type === "CONTRIBUTION_APPLICATION");
    
    const docsToDelete = existingDocs.filter((doc) => {
      // Не удаляем документы, которые будем обновлять
      if (existingMembership && doc.id === existingMembership.id) return false;
      if (existingContributions && doc.id === existingContributions.id) return false;
      // Удаляем только документы со статусом GENERATED или DRAFT (не подписанные)
      return doc.status === "GENERATED" || doc.status === "DRAFT";
    });
    
    if (docsToDelete.length > 0) {
      console.log(`[regenerate-documents] Удаление ${docsToDelete.length} старых документов...`);
      await prisma.document.deleteMany({
        where: {
          id: { in: docsToDelete.map(d => d.id) },
        },
      });
      console.log("[regenerate-documents] ✅ Старые документы удалены");
    }

    // Получаем размеры файлов
    const fs = await import("fs/promises");
    const pathModule = await import("path");

    const membershipStats = await fs.stat(pathModule.join(process.cwd(), "public", membershipPath));
    const contributionsStats = await fs.stat(pathModule.join(process.cwd(), "public", contributionsPath));

    // Обновляем или создаем документы
    if (existingMembership) {
      await prisma.document.update({
        where: { id: existingMembership.id },
        data: {
          filePath: membershipPath,
          fileName: pathModule.basename(membershipPath),
          fileSize: membershipStats.size,
          status: "GENERATED",
          // Сбрасываем старые подписанные документы и Google Drive
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
        },
      });
      console.log("[regenerate-documents] ✅ Membership application updated (old signed version cleared)");
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
      console.log("[regenerate-documents] ✅ Membership application created");
    }

    if (existingContributions) {
      await prisma.document.update({
        where: { id: existingContributions.id },
        data: {
          filePath: contributionsPath,
          fileName: pathModule.basename(contributionsPath),
          fileSize: contributionsStats.size,
          status: "GENERATED",
          // Сбрасываем старые подписанные документы и Google Drive
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
        },
      });
      console.log("[regenerate-documents] ✅ Contributions application updated (old signed version cleared)");
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
      console.log("[regenerate-documents] ✅ Contributions application created");
    }

    // Сбрасываем флаг изменения профиля
    await prisma.user.update({
      where: { id: user.id },
      data: {
        profileChangedAfterDocuments: false,
      },
    });

    console.log("[regenerate-documents] ✅ Documents regenerated successfully");

    return NextResponse.json({
      success: true,
      message: "Документы успешно перегенерированы",
    });
  } catch (error) {
    console.error("[regenerate-documents] Error:", error);
    return NextResponse.json(
      {
        error: "Не удалось перегенерировать документы",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

