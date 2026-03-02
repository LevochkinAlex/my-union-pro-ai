/**
 * Удаляет ошибочно восстановленный пост с заголовком «Тест» (один пост).
 * Запуск: pnpm run delete:test-news-post
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const post = await prisma.newsPost.findFirst({
    where: { title: "Тест" },
    select: { id: true, title: true, createdAt: true },
  });

  if (!post) {
    console.log("Пост с заголовком «Тест» не найден.");
    await prisma.$disconnect();
    return;
  }

  await prisma.newsPost.delete({ where: { id: post.id } });
  console.log(`Удалён пост: id=${post.id}, title="${post.title}", createdAt=${post.createdAt}`);
  await prisma.$disconnect();
}

main();
