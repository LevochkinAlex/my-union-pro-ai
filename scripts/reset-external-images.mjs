#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetExternalImages() {
  console.log('🔄 Сброс внешних ссылок на изображения...\n');

  try {
    // Находим все новости с внешними изображениями
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
      console.log('✅ Все изображения уже локальные или отсутствуют!');
      return;
    }

    console.log(`Найдено ${news.length} новостей с внешними ссылками:\n`);
    news.forEach(n => {
      console.log(`  • ${n.title}`);
      console.log(`    ${n.coverImage}\n`);
    });

    // Сбрасываем внешние ссылки
    const result = await prisma.newsPost.updateMany({
      where: {
        coverImage: {
          startsWith: 'http'
        }
      },
      data: {
        coverImage: null
      }
    });

    console.log(`\n✅ Сброшено ${result.count} внешних ссылок`);
    console.log('\n📝 Теперь администратор может загрузить изображения через админ-панель');
    console.log('   с использованием нового медиа-менеджера и кроппинга!\n');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetExternalImages();

