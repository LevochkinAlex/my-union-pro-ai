#!/usr/bin/env node
/**
 * Исправляет привязку «МООП РЗ РФ» → ППО Аппарат МООП РЗ РФ.
 * При выборе места работы «МООП РЗ РФ» (ИНН 7706045006) должна подставляться
 * «ППО Аппарат МООП РЗ РФ», а не «ППО ГБУ МО Мособлмедсервис».
 *
 * Использование: pnpm exec dotenv -e .env.local -- node scripts/fix-mooprz-workplace-mapping.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WORKPLACE_NAMES = ["МООП РЗ РФ", "Московская областная организация профсоюза работников здравоохранения РФ"];
const WORKPLACE_INN = "7706045006";
const CORRECT_PPO_NAME = "ППО Аппарат МООП РЗ РФ";

async function main() {
  const ppo = await prisma.organization.findFirst({
    where: { name: CORRECT_PPO_NAME, type: "PRIMARY" },
    select: { id: true, name: true },
  });

  if (!ppo) {
    console.error("[fix-mooprz] ❌ ППО не найдена:", CORRECT_PPO_NAME);
    process.exit(1);
  }

  console.log("[fix-mooprz] Целевая ППО:", ppo.id, ppo.name);

  for (const workplaceName of WORKPLACE_NAMES) {
    const existing = await prisma.workplacePPOMapping.findUnique({
      where: {
        workplaceName_workplaceInn: {
          workplaceName,
          workplaceInn: WORKPLACE_INN,
        },
      },
      include: {
        ppoOrganization: { select: { id: true, name: true } },
      },
    });

    if (existing) {
      if (existing.ppoOrganizationId === ppo.id) {
        console.log("[fix-mooprz] ✅", workplaceName, "→ уже привязано к", ppo.name);
        continue;
      }
      console.log("[fix-mooprz] Исправляю:", workplaceName, "было →", existing.ppoOrganization.name);
    } else {
      console.log("[fix-mooprz] Создаю привязку:", workplaceName, "→", ppo.name);
    }

    await prisma.workplacePPOMapping.upsert({
      where: {
        workplaceName_workplaceInn: {
          workplaceName,
          workplaceInn: WORKPLACE_INN,
        },
      },
      update: { ppoOrganizationId: ppo.id, verified: true },
      create: {
        workplaceName,
        workplaceInn: WORKPLACE_INN,
        ppoOrganizationId: ppo.id,
        source: "manual",
        verified: true,
        notes: "Исправлено: МООП РЗ РФ (аппарат) → ППО Аппарат МООП РЗ РФ",
      },
    });
    console.log("[fix-mooprz] ✅ Обновлено:", workplaceName, "→", ppo.name);
  }

  console.log("[fix-mooprz] Готово.");
}

main()
  .catch((e) => {
    console.error("[fix-mooprz] Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
