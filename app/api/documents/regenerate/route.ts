import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";
import { DocumentType } from "@prisma/client";

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

    // Проверяем наличие всех обязательных данных (как в /api/documents/generate)
    const hasOrganization = user.organizationId || user.organizationName;
    
    if (
      !user.firstName ||
      !user.lastName ||
      !user.dateOfBirth ||
      !user.address ||
      !user.phone ||
      !user.jobTitle ||
      !user.workplace ||
      !hasOrganization
    ) {
      const missingFields = [];
      if (!user.firstName) missingFields.push("Имя");
      if (!user.lastName) missingFields.push("Фамилия");
      if (!user.dateOfBirth) missingFields.push("Дата рождения");
      if (!user.address) missingFields.push("Адрес");
      if (!user.phone) missingFields.push("Телефон");
      if (!user.jobTitle) missingFields.push("Должность");
      if (!user.workplace) missingFields.push("Место работы");
      if (!hasOrganization) missingFields.push("Организация профсоюза");
      
      return NextResponse.json(
        { 
          error: "Профиль не полностью заполнен. Пожалуйста, заполните все обязательные поля.",
          missingFields,
        },
        { status: 400 }
      );
    }

    // Получаем шаблоны по умолчанию для заявлений
    console.log("[regenerate-documents] Поиск шаблонов документов...");
    
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
      console.error("[regenerate-documents] ❌ Шаблон заявления о вступлении не найден");
      return NextResponse.json(
        { error: "Шаблон заявления о вступлении не настроен. Обратитесь к администратору." },
        { status: 500 }
      );
    }

    if (!duesTemplate) {
      console.error("[regenerate-documents] ❌ Шаблон заявления о взносах не найден");
      return NextResponse.json(
        { error: "Шаблон заявления о взносах не настроен. Обратитесь к администратору." },
        { status: 500 }
      );
    }

    console.log("[regenerate-documents] Regenerating documents for user:", user.email);

    // Генерируем новые PDF файлы из шаблонов
    let membershipPdf: Buffer;
    let duesPdf: Buffer;
    
    try {
      console.log("[regenerate-documents] Генерация заявления о вступлении из шаблона...");
      membershipPdf = await generateDocumentFromTemplate(membershipTemplate, user);
      console.log("[regenerate-documents] ✅ Заявление о вступлении сгенерировано, размер:", membershipPdf.length, "байт");
    } catch (membershipError) {
      console.error("[regenerate-documents] ❌ Ошибка генерации заявления о вступлении:", membershipError);
      throw new Error(`Ошибка генерации заявления о вступлении: ${membershipError instanceof Error ? membershipError.message : String(membershipError)}`);
    }
    
    try {
      console.log("[regenerate-documents] Генерация заявления о взносах из шаблона...");
      duesPdf = await generateDocumentFromTemplate(duesTemplate, user);
      console.log("[regenerate-documents] ✅ Заявление о взносах сгенерировано, размер:", duesPdf.length, "байт");
    } catch (duesError) {
      console.error("[regenerate-documents] ❌ Ошибка генерации заявления о взносах:", duesError);
      throw new Error(`Ошибка генерации заявления о взносах: ${duesError instanceof Error ? duesError.message : String(duesError)}`);
    }

    console.log("[regenerate-documents] PDF files generated, sizes:", { membership: membershipPdf.length, dues: duesPdf.length });

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

    // Обновляем или создаем документы (сохраняем в БД как base64, как в /api/documents/generate)
    if (existingMembership) {
      await prisma.document.update({
        where: { id: existingMembership.id },
        data: {
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          description: `Заявление о вступлении в МООП РЗ от ${user.lastName} ${user.firstName}`,
          fileName: `membership_application_${user.id}_${Date.now()}.pdf`,
          fileSize: membershipPdf.length,
          mimeType: "application/pdf",
          content: membershipPdf.toString("base64"), // Сохраняем как base64
          templateId: membershipTemplate.id,
          // Сбрасываем старые подписанные документы и Google Drive
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
          filePath: null, // Убираем filePath, так как используем content
        },
      });
      console.log("[regenerate-documents] ✅ Membership application updated (old signed version cleared)");
    } else {
      await prisma.document.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: DocumentType.MEMBERSHIP_APPLICATION,
          status: "GENERATED",
          title: "Заявление о вступлении в профсоюз",
          description: `Заявление о вступлении в МООП РЗ от ${user.lastName} ${user.firstName}`,
          fileName: `membership_application_${user.id}_${Date.now()}.pdf`,
          fileSize: membershipPdf.length,
          mimeType: "application/pdf",
          content: membershipPdf.toString("base64"), // Сохраняем как base64
          templateId: membershipTemplate.id,
        },
      });
      console.log("[regenerate-documents] ✅ Membership application created");
    }

    if (existingContributions) {
      await prisma.document.update({
        where: { id: existingContributions.id },
        data: {
          status: "GENERATED",
          title: "Заявление о перечислении членских взносов",
          description: `Заявление о взносах от ${user.lastName} ${user.firstName}`,
          fileName: `dues_application_${user.id}_${Date.now()}.pdf`,
          fileSize: duesPdf.length,
          mimeType: "application/pdf",
          content: duesPdf.toString("base64"), // Сохраняем как base64
          templateId: duesTemplate.id,
          // Сбрасываем старые подписанные документы и Google Drive
          signedFilePath: null,
          driveFileId: null,
          driveUrl: null,
          filePath: null, // Убираем filePath, так как используем content
        },
      });
      console.log("[regenerate-documents] ✅ Contributions application updated (old signed version cleared)");
    } else {
      await prisma.document.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          type: DocumentType.CONTRIBUTION_APPLICATION,
          status: "GENERATED",
          title: "Заявление о перечислении членских взносов",
          description: `Заявление о взносах от ${user.lastName} ${user.firstName}`,
          fileName: `dues_application_${user.id}_${Date.now()}.pdf`,
          fileSize: duesPdf.length,
          mimeType: "application/pdf",
          content: duesPdf.toString("base64"), // Сохраняем как base64
          templateId: duesTemplate.id,
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

    // Инвалидируем кеш профиля, чтобы пользователь видел актуальные данные
    const { cacheDeletePattern } = await import("@/lib/cache");
    await cacheDeletePattern(`profile:userId:${user.id}:*`);

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

