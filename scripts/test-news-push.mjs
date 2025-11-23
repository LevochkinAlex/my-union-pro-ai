#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testNewsPush() {
  try {
    console.log('🧪 Тестируем отправку push-уведомлений при публикации новости...\n');
    
    // Находим супер-админа
    const superAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' }
    });

    if (!superAdmin) {
      console.error('❌ Супер-админ не найден!');
      process.exit(1);
    }

    // Создаем тестовую новость (опубликованную)
    const testNews = await prisma.newsPost.create({
      data: {
        title: 'Тестовая новость для проверки push-уведомлений',
        content: '<p>Это тестовая новость для проверки работы push-уведомлений. Если вы получили уведомление, значит система работает корректно! 🎉</p>',
        coverImage: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&q=80',
        authorId: superAdmin.id,
        isPublished: true,
        publishedAt: new Date(),
      }
    });

    console.log('✅ Тестовая новость создана:', testNews.id);
    console.log('📝 Заголовок:', testNews.title);
    
    // Проверяем количество подписок
    const subscriptionsCount = await prisma.pushSubscription.count({
      where: {
        fcmToken: { not: null }
      }
    });
    
    console.log(`\n📢 В базе ${subscriptionsCount} активных FCM подписок`);
    console.log('\n⚠️  ВАЖНО: Push-уведомления отправляются только через API.');
    console.log('   Для тестирования используйте админ-панель:');
    console.log('   http://localhost:3004/admin/news/new\n');
    console.log('   Или отправьте POST запрос на /api/admin/news с isPublished: true\n');

    // Удаляем тестовую новость
    await prisma.newsPost.delete({
      where: { id: testNews.id }
    });
    
    console.log('🗑️  Тестовая новость удалена\n');
    console.log('✨ Готово! Создайте новость через админ-панель для реальной проверки.');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testNewsPush();

