/**
 * Логика проверки загруженных документов
 */

import { prisma } from "./prisma";
import { extractProfileDataFromMessages } from "./profile-extraction";

interface DocumentVerificationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  extractedData?: Record<string, any>;
}

/**
 * Проверяет загруженный документ на правильность заполнения
 */
export async function verifyUploadedDocument(
  documentId: string,
  userId: string
): Promise<DocumentVerificationResult> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      userId: userId,
    },
    include: {
      user: true,
    },
  });

  if (!document) {
    return {
      isValid: false,
      errors: ["Документ не найден"],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Проверяем, что документ подписан
  if (!document.signedFilePath) {
    errors.push("Документ не подписан. Пожалуйста, загрузите подписанную копию.");
  }

  // Проверяем тип документа
  if (document.type === "MEMBERSHIP_APPLICATION") {
    // Проверяем наличие всех необходимых данных в профиле
    const user = document.user;
    if (!user.firstName || !user.lastName) {
      errors.push("В документе отсутствует ФИО");
    }
    if (!user.dateOfBirth) {
      errors.push("В документе отсутствует дата рождения");
    }
    if (!user.address) {
      errors.push("В документе отсутствует адрес");
    }
    if (!user.phone) {
      warnings.push("В документе отсутствует телефон");
    }
    if (!user.jobTitle) {
      warnings.push("В документе отсутствует должность");
    }
  } else if (document.type === "CONTRIBUTION_APPLICATION") {
    // Проверяем наличие данных для заявления о взносах
    const user = document.user;
    if (!user.firstName || !user.lastName) {
      errors.push("В документе отсутствует ФИО");
    }
    if (!user.jobTitle) {
      errors.push("В документе отсутствует должность");
    }
    if (!user.organizationId) {
      warnings.push("В документе отсутствует информация об организации");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Проверяет документ с помощью AI на основе истории чата
 */
export async function verifyDocumentWithAI(
  documentId: string,
  userId: string,
  sessionId?: string
): Promise<DocumentVerificationResult> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      userId: userId,
    },
    include: {
      user: true,
    },
  });

  if (!document) {
    return {
      isValid: false,
      errors: ["Документ не найден"],
      warnings: [],
    };
  }

  // Получаем сообщения из сессии для проверки
  const messages = await prisma.chatMessage.findMany({
    where: {
      userId: userId,
      sessionId: sessionId || undefined,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  // Извлекаем данные из сообщений для сравнения
  const extractedData = await extractProfileDataFromMessages(
    messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))
  );

  const errors: string[] = [];
  const warnings: string[] = [];

  // Сравниваем данные из профиля с данными из чата
  const user = document.user;
  
  if (document.type === "MEMBERSHIP_APPLICATION") {
    if (extractedData.firstName && user.firstName !== extractedData.firstName) {
      warnings.push(`Имя в документе может отличаться от указанного в чате: ${user.firstName} vs ${extractedData.firstName}`);
    }
    if (extractedData.lastName && user.lastName !== extractedData.lastName) {
      warnings.push(`Фамилия в документе может отличаться от указанной в чате: ${user.lastName} vs ${extractedData.lastName}`);
    }
    if (extractedData.dateOfBirth && user.dateOfBirth) {
      const chatDate = new Date(extractedData.dateOfBirth);
      const profileDate = new Date(user.dateOfBirth);
      if (chatDate.getTime() !== profileDate.getTime()) {
        warnings.push("Дата рождения в документе может отличаться от указанной в чате");
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    extractedData,
  };
}

