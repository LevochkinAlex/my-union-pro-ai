#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function downloadImage(url, filepath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    await writeFile(filepath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`Ошибка загрузки ${url}:`, error.message);
    return false;
  }
}

async function migrateNewsImages() {
  console.log('🖼️  Миграция изображений новостей...\n');

  try {
    // Получаем все новости с внешними изображениями
    const news = await prisma.newsPost.findMany({
      where: {
        coverImage: {
          not: null,
          startsWith: 'http'
        }
      },
      select: {
        id: true,
        title: true,
        coverImage: true,
      }
    });

    if (news.length === 0) {
      console.log('✅ Все изображения уже локальные!');
      return;
    }

    console.log(`Найдено ${news.length} новостей с внешними изображениями\n`);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'news');
    let successCount = 0;
    let failCount = 0;

    for (const item of news) {
      console.log(`📥 [${item.id}] ${item.title}`);
      console.log(`   Текущий URL: ${item.coverImage}`);

      // Генерируем локальное имя файла
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 15);
      const fileName = `news-${timestamp}-${randomStr}.jpg`;
      const filePath = path.join(uploadDir, fileName);
      const publicUrl = `/uploads/news/${fileName}`;

      // Скачиваем изображение
      const success = await downloadImage(item.coverImage, filePath);

      if (success) {
        // Обновляем запись в БД
        await prisma.newsPost.update({
          where: { id: item.id },
          data: { coverImage: publicUrl }
        });
        console.log(`   ✅ Сохранено: ${publicUrl}\n`);
        successCount++;
      } else {
        console.log(`   ❌ Не удалось скачать\n`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Успешно: ${successCount}`);
    if (failCount > 0) {
      console.log(`❌ Ошибки: ${failCount}`);
    }
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateNewsImages();

