/**
 * Скрипт миграции новостей от супер-админа к председателю ППО
 * 
 * Выполнить: npx ts-node scripts/migrate-news-to-ppo.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Начинаем миграцию новостей...\n");

  // 1. Находим пользователя talik.e@mail.ru
  const chairman = await prisma.user.findUnique({
    where: { email: "talik.e@mail.ru" },
    include: {
      ppoHeadOrganization: true,
    },
  });

  if (!chairman) {
    console.error("❌ Пользователь talik.e@mail.ru не найден!");
    return;
  }

  console.log(`✅ Найден пользователь: ${chairman.firstName} ${chairman.lastName}`);
  console.log(`   Email: ${chairman.email}`);
  console.log(`   ID: ${chairman.id}`);
  console.log(`   isPPOHead: ${chairman.isPPOHead}`);
  
  if (!chairman.ppoHeadOrganization) {
    console.error("❌ Пользователь не является председателем ППО!");
    return;
  }

  const organizationId = chairman.ppoHeadOrganization.id;
  console.log(`   Организация: ${chairman.ppoHeadOrganization.name}`);
  console.log(`   Organization ID: ${organizationId}\n`);

  // 2. Проверяем/создаём основной канал для организации
  let mainChannel = await prisma.newsChannel.findFirst({
    where: {
      organizationId: organizationId,
      isDefault: true,
    },
  });

  if (!mainChannel) {
    console.log("📢 Создаём основной канал для организации...");
    mainChannel = await prisma.newsChannel.create({
      data: {
        name: "Основной",
        description: `Основной канал новостей ${chairman.ppoHeadOrganization.name}`,
        organizationId: organizationId,
        createdById: chairman.id,
        isDefault: true,
        isActive: true,
      },
    });
    console.log(`✅ Канал создан: ${mainChannel.id}\n`);
  } else {
    console.log(`✅ Основной канал уже существует: ${mainChannel.name} (${mainChannel.id})\n`);
  }

  // 3. Находим все новости из супер-админки (без organizationId в канале или с channelId = null)
  // Новости супер-админа - это те, у которых автор - супер-админ
  const superAdmins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });

  const superAdminIds = superAdmins.map(u => u.id);
  console.log(`👤 Найдено супер-админов: ${superAdminIds.length}`);

  const adminNews = await prisma.newsPost.findMany({
    where: {
      authorId: { in: superAdminIds },
    },
    include: {
      author: { select: { email: true, firstName: true, lastName: true } },
      channel: { select: { id: true, name: true, organizationId: true } },
    },
  });

  console.log(`📰 Найдено новостей от супер-админов: ${adminNews.length}\n`);

  if (adminNews.length === 0) {
    console.log("ℹ️ Новостей для миграции нет.");
    return;
  }

  // 4. Переносим каждую новость
  let migratedCount = 0;
  for (const post of adminNews) {
    console.log(`📝 Переносим: "${post.title}"`);
    console.log(`   Автор: ${post.author.email}`);
    console.log(`   Канал: ${post.channel?.name || "Без канала"}`);

    await prisma.newsPost.update({
      where: { id: post.id },
      data: {
        authorId: chairman.id,
        channelId: mainChannel.id,
      },
    });

    console.log(`   ✅ Перенесено!\n`);
    migratedCount++;
  }

  console.log(`\n🎉 Миграция завершена! Перенесено новостей: ${migratedCount}`);
  console.log(`   Новый автор: ${chairman.email}`);
  console.log(`   Канал: ${mainChannel.name}`);
  console.log(`   Организация: ${chairman.ppoHeadOrganization.name}`);
}

main()
  .catch((e) => {
    console.error("❌ Ошибка:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

