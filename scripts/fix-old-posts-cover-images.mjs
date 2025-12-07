#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

async function fixOldPostsCoverImages() {
  console.log('🔍 Поиск старых постов без обложек...\n');

  // Получаем все посты без coverImage, но с attachments
  const posts = await prisma.userPost.findMany({
    where: {
      coverImage: null,
      attachments: {
        some: {
          type: 'image'
        }
      }
    },
    include: {
      attachments: {
        where: {
          type: 'image'
        },
        orderBy: {
          createdAt: 'asc' // Берем первое изображение
        },
        take: 1
      }
    }
  });

  console.log(`📊 Найдено постов без обложек, но с изображениями: ${posts.length}\n`);

  let fixedPosts = 0;
  let skippedPosts = 0;

  for (const post of posts) {
    const firstImageAttachment = post.attachments[0];
    
    if (!firstImageAttachment || !firstImageAttachment.filePath) {
      skippedPosts++;
      continue;
    }

    // Проверяем, что путь валидный
    const imagePath = firstImageAttachment.filePath.trim();
    
    // Пропускаем битые пути
    if (imagePath.length < 3) {
      console.log(`⚠️  Пост ${post.id}: Пропущен - некорректный путь к изображению`);
      skippedPosts++;
      continue;
    }

    try {
      // Устанавливаем первое изображение как coverImage
      await prisma.userPost.update({
        where: { id: post.id },
        data: {
          coverImage: imagePath
        }
      });

      console.log(`✅ Пост ${post.id}: Установлена обложка из attachment: ${imagePath}`);
      fixedPosts++;
    } catch (error) {
      console.error(`❌ Ошибка при обновлении поста ${post.id}:`, error.message);
      skippedPosts++;
    }
  }

  console.log('\n✅ Обработка завершена!');
  console.log(`📊 Статистика:`);
  console.log(`   - Постов исправлено: ${fixedPosts}`);
  console.log(`   - Постов пропущено: ${skippedPosts}`);
}

fixOldPostsCoverImages()
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

