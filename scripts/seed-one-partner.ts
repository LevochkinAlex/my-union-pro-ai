/**
 * Однократно создаёт демо-партнёра, если таблица Partner пуста (локальная разработка).
 * Запуск: npx tsx scripts/seed-one-partner.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.partner.count();
  if (count > 0) {
    const list = await prisma.partner.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, createdAt: true },
    });
    console.log("Partner уже есть в БД:", list.length, "показано до 5:");
    console.log(list);
    return;
  }

  const p = await prisma.partner.create({
    data: {
      name: "Партнёр (локально сохранённый)",
      description: "Запись создана скриптом seed-one-partner.ts для отображения в списке.",
      isActive: true,
    },
  });
  console.log("Создан партнёр:", p.id, p.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
