/**
 * Однократное удаление всех копий постановлений из «Входящих».
 * Запуск: pnpm run delete:resolution-copies-inbox
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const result = await prisma.document.deleteMany({
    where: {
      type: "RESOLUTION",
      assignedToId: { not: null },
    },
  });
  console.log(`Удалено копий постановлений из Входящих: ${result.count}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
