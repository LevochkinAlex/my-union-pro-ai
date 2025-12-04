import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDocumentFromTemplate } from "@/lib/document-templates/renderer";
import { DocumentType } from "@prisma/client";
import { sendNotification } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Получаем данные пользователя
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Проверяем наличие всех обязательных данных
    console.log("[documents/generate] Проверка данных пользователя:", {
      firstName: !!user.firstName,
      lastName: !!user.lastName,
      dateOfBirth: !!user.dateOfBirth,
      address: !!user.address,
      phone: !!user.phone,
      jobTitle: !!user.jobTitle,
      profession: !!user.profession,
      education: !!user.education,
      organization: !!user.organization,
      organizationId: user.organizationId,
    });
    
    // Проверяем наличие организации (organizationId или organizationName)
    const hasOrganization = user.organizationId || user.organizationName;
    
    if (
      !user.firstName ||
      !user.lastName ||
      !user.dateOfBirth ||
      !user.address ||
      !user.phone ||
      !user.jobTitle ||
      !user.profession ||
      !user.education ||
      !hasOrganization
    ) {
      const missingFields = [];
      if (!user.firstName) missingFields.push("Имя");
      if (!user.lastName) missingFields.push("Фамилия");
      if (!user.dateOfBirth) missingFields.push("Дата рождения");
      if (!user.address) missingFields.push("Адрес");
      if (!user.phone) missingFields.push("Телефон");
      if (!user.jobTitle) missingFields.push("Должность");
      if (!user.profession) missingFields.push("Профессия");
      if (!user.education) missingFields.push("Образование");
      if (!hasOrganization) missingFields.push("Организация");
      
      console.error("[documents/generate] ❌ Профиль не полностью заполнен. Отсутствуют поля:", missingFields);
      return NextResponse.json(
        { 
          error: "Профиль не полностью заполнен. Пожалуйста, заполните все обязательные поля.",
          missingFields,
        },
        { status: 400 }
      );
    }

    // Получаем шаблоны по умолчанию для заявлений
    console.log("[documents/generate] Поиск шаблонов документов...");
    
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
      console.error("[documents/generate] ❌ Шаблон заявления о вступлении не найден");
      return NextResponse.json(
        { error: "Шаблон заявления о вступлении не настроен. Обратитесь к администратору." },
        { status: 500 }
      );
    }

    if (!duesTemplate) {
      console.error("[documents/generate] ❌ Шаблон заявления о взносах не найден");
      return NextResponse.json(
        { error: "Шаблон заявления о взносах не настроен. Обратитесь к администратору." },
        { status: 500 }
      );
    }

    // Генерируем оба документа из шаблонов
    console.log("[documents/generate] Начинаем генерацию PDF документов из шаблонов...");
    let membershipPdf: Buffer;
    let duesPdf: Buffer;
    
    try {
      console.log("[documents/generate] Генерация заявления о вступлении из шаблона...");
      membershipPdf = await generateDocumentFromTemplate(membershipTemplate, user);
      console.log("[documents/generate] ✅ Заявление о вступлении сгенерировано, размер:", membershipPdf.length, "байт");
    } catch (membershipError) {
      console.error("[documents/generate] ❌ Ошибка генерации заявления о вступлении:", membershipError);
      throw new Error(`Ошибка генерации заявления о вступлении: ${membershipError instanceof Error ? membershipError.message : String(membershipError)}`);
    }
    
    try {
      console.log("[documents/generate] Генерация заявления о взносах из шаблона...");
      duesPdf = await generateDocumentFromTemplate(duesTemplate, user);
      console.log("[documents/generate] ✅ Заявление о взносах сгенерировано, размер:", duesPdf.length, "байт");
    } catch (duesError) {
      console.error("[documents/generate] ❌ Ошибка генерации заявления о взносах:", duesError);
      throw new Error(`Ошибка генерации заявления о взносах: ${duesError instanceof Error ? duesError.message : String(duesError)}`);
    }

    // Сохраняем документы в БД (обновляем существующие или создаем новые)
    console.log("[documents/generate] Сохранение документов в БД...");
    
    // Проверяем существующие документы
    const existingDocs = await prisma.document.findMany({
      where: {
        userId: user.id,
        type: {
          in: [DocumentType.MEMBERSHIP_APPLICATION, DocumentType.CONTRIBUTION_APPLICATION],
        },
      },
    });

    const existingMembership = existingDocs.find((d) => d.type === DocumentType.MEMBERSHIP_APPLICATION);
    const existingDues = existingDocs.find((d) => d.type === DocumentType.CONTRIBUTION_APPLICATION);
    
    // Удаляем все старые документы того же типа, кроме тех, которые обновляем
    // Это предотвращает накопление дубликатов
    const docsToDelete = existingDocs.filter((doc) => {
      // Не удаляем документы, которые будем обновлять
      if (existingMembership && doc.id === existingMembership.id) return false;
      if (existingDues && doc.id === existingDues.id) return false;
      // Удаляем только документы со статусом GENERATED или DRAFT (не подписанные)
      return doc.status === "GENERATED" || doc.status === "DRAFT";
    });
    
    if (docsToDelete.length > 0) {
      console.log(`[documents/generate] Удаление ${docsToDelete.length} старых документов...`);
      await prisma.document.deleteMany({
        where: {
          id: { in: docsToDelete.map(d => d.id) },
        },
      });
      console.log("[documents/generate] ✅ Старые документы удалены");
    }
    
    let membershipDoc, duesDoc;
    
    try {
      if (existingMembership) {
        console.log("[documents/generate] Обновление существующего заявления о вступлении...");
        membershipDoc = await prisma.document.update({
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
            // Сбрасываем старые подписанные документы
            signedFilePath: null,
            driveFileId: null,
            driveUrl: null,
          },
        });
        console.log("[documents/generate] ✅ Заявление о вступлении обновлено, ID:", membershipDoc.id);
      } else {
        console.log("[documents/generate] Создание нового заявления о вступлении...");
        membershipDoc = await prisma.document.create({
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
        console.log("[documents/generate] ✅ Заявление о вступлении создано, ID:", membershipDoc.id);
      }
    } catch (membershipSaveError) {
      console.error("[documents/generate] ❌ Ошибка сохранения заявления о вступлении:", membershipSaveError);
      throw new Error(`Ошибка сохранения заявления о вступлении: ${membershipSaveError instanceof Error ? membershipSaveError.message : String(membershipSaveError)}`);
    }
    
    try {
      if (existingDues) {
        console.log("[documents/generate] Обновление существующего заявления о взносах...");
        duesDoc = await prisma.document.update({
          where: { id: existingDues.id },
          data: {
            status: "GENERATED",
            title: "Заявление о перечислении членских взносов",
            description: `Заявление о взносах от ${user.lastName} ${user.firstName}`,
            fileName: `dues_application_${user.id}_${Date.now()}.pdf`,
            fileSize: duesPdf.length,
            mimeType: "application/pdf",
            content: duesPdf.toString("base64"), // Сохраняем как base64
            templateId: duesTemplate.id,
            // Сбрасываем старые подписанные документы
            signedFilePath: null,
            driveFileId: null,
            driveUrl: null,
          },
        });
        console.log("[documents/generate] ✅ Заявление о взносах обновлено, ID:", duesDoc.id);
      } else {
        console.log("[documents/generate] Создание нового заявления о взносах...");
        duesDoc = await prisma.document.create({
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
        console.log("[documents/generate] ✅ Заявление о взносах создано, ID:", duesDoc.id);
      }
    } catch (duesSaveError) {
      console.error("[documents/generate] ❌ Ошибка сохранения заявления о взносах:", duesSaveError);
      throw new Error(`Ошибка сохранения заявления о взносах: ${duesSaveError instanceof Error ? duesSaveError.message : String(duesSaveError)}`);
    }

    // Сбрасываем флаг изменения профиля
    await prisma.user.update({
      where: { id: user.id },
      data: {
        profileChangedAfterDocuments: false,
      },
    });

    // Отправляем уведомление пользователю о готовности документов
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://myunion.pro";
      await sendNotification({
        userId: user.id,
        title: "Документы готовы для подписания",
        message: `Ваши заявления о вступлении в профсоюз и перечислении членских взносов сгенерированы и готовы для скачивания и подписания.`,
        link: `${baseUrl}/dashboard/documents`,
        data: {
          type: "documents_ready",
          documentIds: [membershipDoc.id, duesDoc.id],
        },
      });
      console.log("[documents/generate] ✅ Уведомление отправлено пользователю");
    } catch (notificationError) {
      console.error("[documents/generate] ⚠️ Ошибка отправки уведомления:", notificationError);
      // Не прерываем успешную генерацию из-за ошибки уведомления
    }

    return NextResponse.json({
      success: true,
      documents: [
        {
          id: membershipDoc.id,
          type: membershipDoc.type,
          title: membershipDoc.title,
          fileName: membershipDoc.fileName,
        },
        {
          id: duesDoc.id,
          type: duesDoc.type,
          title: duesDoc.title,
          fileName: duesDoc.fileName,
        },
      ],
    });
  } catch (error) {
    console.error("[documents/generate] Ошибка генерации документов:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("[documents/generate] Детали ошибки:", {
      message: errorMessage,
      stack: errorStack,
    });
    
    return NextResponse.json(
      { 
        error: "Ошибка при генерации документов. Попробуйте позже.",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
