/**
 * Проверка справочников должностей и профессий
 */

import { prisma } from "../lib/prisma";

async function checkDictionaries() {
  console.log("\n📚 ПРОВЕРКА СПРАВОЧНИКОВ\n");
  console.log("═".repeat(60));
  
  // Должности
  const jobTitlesCount = await prisma.jobTitle.count();
  console.log(`\n💼 ДОЛЖНОСТИ: ${jobTitlesCount} записей`);
  
  if (jobTitlesCount > 0) {
    const sampleJobTitles = await prisma.jobTitle.findMany({
      take: 10,
      orderBy: { name: "asc" },
    });
    console.log("\nПримеры должностей:");
    sampleJobTitles.forEach((jt, idx) => {
      console.log(`  ${idx + 1}. ${jt.name}`);
    });
    
    // Проверка "массажист"
    const massazhist = await prisma.jobTitle.findFirst({
      where: {
        name: {
          contains: "массажист",
          mode: "insensitive",
        },
      },
    });
    console.log(`\n🔍 Поиск "массажист": ${massazhist ? `✅ ${massazhist.name}` : "❌ не найдено"}`);
  } else {
    console.log("⚠️ СПРАВОЧНИК ДОЛЖНОСТЕЙ ПУСТОЙ!");
  }
  
  // Профессии
  const professionsCount = await prisma.profession.count();
  console.log(`\n\n🎓 ПРОФЕССИИ: ${professionsCount} записей`);
  
  if (professionsCount > 0) {
    const sampleProfessions = await prisma.profession.findMany({
      take: 10,
      orderBy: { name: "asc" },
    });
    console.log("\nПримеры профессий:");
    sampleProfessions.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.name}`);
    });
  } else {
    console.log("⚠️ СПРАВОЧНИК ПРОФЕССИЙ ПУСТОЙ!");
  }
  
  console.log("\n" + "═".repeat(60));
}

checkDictionaries()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

