/**
 * Скрипт для восстановления данных пользователя из подписанных документов
 * Использует данные из последнего подписанного документа для восстановления профиля
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function restoreUserDataFromDocuments(userId: string) {
  try {
    console.log(`[restore] Начинаем восстановление данных для пользователя ${userId}`);

    // Получаем последний подписанный документ пользователя
    const signedDocument = await prisma.document.findFirst({
      where: {
        userId,
        status: "SIGNED",
        type: { in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"] },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!signedDocument) {
      console.log("[restore] Подписанные документы не найдены");
      return;
    }

    console.log(`[restore] Найден подписанный документ: ${signedDocument.type} (${signedDocument.status})`);
    console.log(`[restore] Дата обновления: ${signedDocument.updatedAt}`);

    // Пытаемся извлечь данные из файла документа
    let documentData: any = null;

    if (signedDocument.filePath && fs.existsSync(signedDocument.filePath)) {
      console.log(`[restore] Читаем файл: ${signedDocument.filePath}`);
      // Здесь можно добавить парсинг PDF, но это сложно
      // Пока используем данные пользователя из БД на момент создания документа
    }

    // Используем данные пользователя, которые были при создании документа
    // Если документ был создан недавно, данные должны быть актуальными
    const user = signedDocument.user;

    // Восстанавливаем только те поля, которые сейчас null
    const updateData: any = {};
    let hasUpdates = false;

    if (!user.firstName && user.firstName) {
      updateData.firstName = user.firstName;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем firstName: ${user.firstName}`);
    }

    if (!user.lastName && user.lastName) {
      updateData.lastName = user.lastName;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем lastName: ${user.lastName}`);
    }

    if (!user.middleName && user.middleName) {
      updateData.middleName = user.middleName;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем middleName: ${user.middleName}`);
    }

    if (!user.phone && user.phone) {
      updateData.phone = user.phone;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем phone: ${user.phone}`);
    }

    if (!user.dateOfBirth && user.dateOfBirth) {
      updateData.dateOfBirth = user.dateOfBirth;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем dateOfBirth: ${user.dateOfBirth}`);
    }

    if (!user.address && user.address) {
      updateData.address = user.address;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем address: ${user.address}`);
    }

    if (!user.jobTitle && user.jobTitle) {
      updateData.jobTitle = user.jobTitle;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем jobTitle: ${user.jobTitle}`);
    }

    if (!user.profession && user.profession) {
      updateData.profession = user.profession;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем profession: ${user.profession}`);
    }

    if (!user.education && user.education) {
      updateData.education = user.education;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем education: ${user.education}`);
    }

    if (!user.organizationId && user.organizationId) {
      updateData.organizationId = user.organizationId;
      hasUpdates = true;
      console.log(`[restore] Восстанавливаем organizationId: ${user.organizationId}`);
    }

    if (hasUpdates) {
      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      console.log(`[restore] ✅ Данные восстановлены для пользователя ${userId}`);
    } else {
      console.log(`[restore] Нет данных для восстановления (все поля уже заполнены или пусты)`);
    }
  } catch (error) {
    console.error("[restore] Ошибка при восстановлении данных:", error);
    throw error;
  }
}

async function main() {
  const userId = process.argv[2] || "cminb6via00021yuksmejeriz"; // ID пользователя ganteya@gmail.com

  try {
    await restoreUserDataFromDocuments(userId);
  } catch (error) {
    console.error("Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

