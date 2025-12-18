#!/usr/bin/env node

/**
 * Скрипт для миграции новостей от супер-админов к председателю ППО
 * Использование: node scripts/migrate-news.mjs <targetEmail>
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { resolve } from "path";

// Загружаем переменные окружения
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

// Используем оригинальный DATABASE_URL - он уже настроен правильно

const prisma = new PrismaClient();

async function migrateNews(targetEmail) {
  try {
    console.log(`\n🔄 Начинаем миграцию новостей к ${targetEmail}...\n`);

    // 1. Находим пользователя-председателя
    const chairman = await prisma.user.findUnique({
      where: { email: targetEmail },
      include: {
        ppoHeadOrganization: true,
      },
    });

    if (!chairman) {
      throw new Error(`❌ Пользователь ${targetEmail} не найден`);
    }

    if (!chairman.isPPOHead || !chairman.ppoHeadOrganization) {
      throw new Error(`❌ Пользователь ${targetEmail} не является председателем ППО`);
    }

    console.log(`✅ Найден председатель: ${chairman.firstName} ${chairman.lastName}`);
    console.log(`   Организация: ${chairman.ppoHeadOrganization.name}\n`);

    const organizationId = chairman.ppoHeadOrganization.id;

    // 2. Проверяем/создаём основной канал для организации
    let mainChannel = await prisma.newsChannel.findFirst({
      where: {
        organizationId: organizationId,
        isMain: true,
      },
    });

    if (!mainChannel) {
      mainChannel = await prisma.newsChannel.create({
        data: {
          name: "Основной",
          description: `Основной канал новостей ${chairman.ppoHeadOrganization.name}`,
          organizationId: organizationId,
          createdById: chairman.id,
          isMain: true,
        },
      });
      console.log(`✅ Создан канал: ${mainChannel.name}\n`);
    } else {
      console.log(`✅ Используется канал: ${mainChannel.name}\n`);
    }

    // 3. Находим все новости от супер-админов
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN" },
      select: { id: true, email: true },
    });

    const superAdminIds = superAdmins.map((u) => u.id);
    console.log(`📋 Найдено супер-админов: ${superAdmins.length}`);

    const adminNews = await prisma.newsPost.findMany({
      where: {
        authorId: { in: superAdminIds },
      },
      select: {
        id: true,
        title: true,
        author: {
          select: {
            email: true,
          },
        },
      },
    });

    console.log(`📰 Найдено новостей от супер-админов: ${adminNews.length}\n`);

    if (adminNews.length === 0) {
      console.log("✅ Нет новостей для миграции");
      return;
    }

    // 4. Переносим каждую новость
    const migratedPosts = [];
    for (const post of adminNews) {
      await prisma.newsPost.update({
        where: { id: post.id },
        data: {
          authorId: chairman.id,
          channelId: mainChannel.id,
        },
      });
      migratedPosts.push({
        id: post.id,
        title: post.title,
        oldAuthor: post.author.email,
      });
      console.log(`  ✓ Перенесена: "${post.title}"`);
    }

    console.log(`\n✅ Миграция завершена!`);
    console.log(`   Перенесено новостей: ${migratedPosts.length}`);
    console.log(`   Новый автор: ${chairman.firstName} ${chairman.lastName}`);
    console.log(`   Канал: ${mainChannel.name}\n`);

    return {
      success: true,
      migratedCount: migratedPosts.length,
      chairman: {
        id: chairman.id,
        email: chairman.email,
        name: `${chairman.firstName} ${chairman.lastName}`,
      },
      organization: chairman.ppoHeadOrganization.name,
      channel: {
        id: mainChannel.id,
        name: mainChannel.name,
      },
      migratedPosts,
    };
  } catch (error) {
    console.error("\n❌ Ошибка миграции:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск скрипта
const targetEmail = process.argv[2];

if (!targetEmail) {
  console.error("❌ Укажите email председателя:");
  console.error("   node scripts/migrate-news.mjs <targetEmail>");
  process.exit(1);
}

migrateNews(targetEmail)
  .then((result) => {
    if (result) {
      console.log("\n📊 Результат:", JSON.stringify(result, null, 2));
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Критическая ошибка:", error);
    process.exit(1);
  });

