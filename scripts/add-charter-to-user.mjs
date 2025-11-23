#!/usr/bin/env node

/**
 * Добавляет Устав профсоюза конкретному пользователю
 * Usage: node scripts/add-charter-to-user.mjs <email>
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: '.env.local' });

const prisma = new PrismaClient();

const CHARTER_PATH = "/docs/union/Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";
const CHARTER_TITLE = "Устав Профсоюза работников здравоохранения РФ";
const CHARTER_DESCRIPTION = "Устав Профсоюза работников здравоохранения РФ (принят на VII съезде, апрель 2021)";
const CHARTER_FILENAME = "Устав Профсоюза (принят на VII съезде апрель 2021) зарегистрировано для публикации на сайте и печати.docx";

async function addCharterToUser(email) {
  try {
    console.log(`📄 Добавление Устава пользователю: ${email}...`);
    console.log();

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: {
          where: {
            type: 'OTHER',
            title: {
              contains: 'Устав'
            }
          }
        }
      }
    });

    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exit(1);
    }

    console.log(`👤 Пользователь найден: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Документов: ${user.documents.length}`);
    console.log();

    // Проверяем, есть ли уже Устав
    if (user.documents.length > 0) {
      console.log(`✅ У пользователя уже есть Устав, пропускаем`);
      console.log(`   Документ ID: ${user.documents[0].id}`);
      console.log(`   Путь: ${user.documents[0].filePath}`);
      return;
    }

    // Добавляем Устав
    console.log(`📝 Создаю документ "Устав"...`);
    const charter = await prisma.document.create({
      data: {
        userId: user.id,
        type: 'OTHER',
        status: 'GENERATED',
        title: CHARTER_TITLE,
        description: CHARTER_DESCRIPTION,
        filePath: CHARTER_PATH,
        fileName: CHARTER_FILENAME,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });

    console.log(`✅ Устав добавлен!`);
    console.log();
    console.log(`📊 Информация о документе:`);
    console.log(`   ID: ${charter.id}`);
    console.log(`   Название: ${charter.title}`);
    console.log(`   Путь: ${charter.filePath}`);
    console.log(`   Создан: ${charter.createdAt}`);
    console.log();
    console.log(`💡 Теперь Устав доступен в разделе:`);
    console.log(`   https://myunion.pro/dashboard/documents`);

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Не указан email');
  console.log('Usage: node scripts/add-charter-to-user.mjs <email>');
  console.log('Example: node scripts/add-charter-to-user.mjs ceo@yappix.ru');
  process.exit(1);
}

addCharterToUser(email);

