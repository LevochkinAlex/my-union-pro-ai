/**
 * Скрипт миграции постов в формат статей
 * Конвертирует посты с длинным контентом или HTML разметкой в тип "article"
 * 
 * Запуск: npx ts-node scripts/migrate-posts-to-articles.ts
 * Или: npx tsx scripts/migrate-posts-to-articles.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migratePostsToArticles() {
  console.log("🚀 Начинаем миграцию постов...\n");

  try {
    // Получаем все посты
    const allPosts = await prisma.userPost.findMany({
      select: {
        id: true,
        content: true,
        postType: true,
        coverImage: true,
        videoMetadata: true,
        author: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    console.log(`📊 Всего постов в базе: ${allPosts.length}\n`);

    // Статистика
    let convertedToArticle = 0;
    let alreadyArticle = 0;
    let shortPosts = 0;

    for (const post of allPosts) {
      const content = post.content || "";
      const hasHtmlTags = /<[^>]+>/g.test(content);
      const isLongContent = content.length > 300;
      const authorName = `${post.author.firstName || ""} ${post.author.lastName || ""}`.trim() || "Unknown";

      if (post.postType === "article") {
        alreadyArticle++;
        console.log(`✓ [${post.id.slice(0, 8)}...] Уже статья (${authorName})`);
        continue;
      }

      if (hasHtmlTags || isLongContent) {
        // Конвертируем в статью
        await prisma.userPost.update({
          where: { id: post.id },
          data: { postType: "article" },
        });
        convertedToArticle++;
        console.log(`📝 [${post.id.slice(0, 8)}...] Конвертирован в статью (${content.length} символов, HTML: ${hasHtmlTags}) - ${authorName}`);
      } else {
        shortPosts++;
        console.log(`· [${post.id.slice(0, 8)}...] Оставлен как текст (${content.length} символов) - ${authorName}`);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("📊 РЕЗУЛЬТАТЫ МИГРАЦИИ:");
    console.log("=".repeat(50));
    console.log(`✅ Конвертировано в статьи: ${convertedToArticle}`);
    console.log(`📄 Уже были статьями: ${alreadyArticle}`);
    console.log(`📝 Оставлены как текст: ${shortPosts}`);
    console.log(`📊 Всего обработано: ${allPosts.length}`);
    console.log("=".repeat(50));

    // Показываем финальную статистику
    const stats = await prisma.userPost.groupBy({
      by: ["postType"],
      _count: true,
    });

    console.log("\n📈 Текущее распределение по типам:");
    for (const stat of stats) {
      console.log(`   ${stat.postType || "null"}: ${stat._count}`);
    }

  } catch (error) {
    console.error("❌ Ошибка миграции:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск
migratePostsToArticles()
  .then(() => {
    console.log("\n✅ Миграция завершена успешно!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Миграция завершилась с ошибкой:", error);
    process.exit(1);
  });

