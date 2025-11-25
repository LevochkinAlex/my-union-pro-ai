/**
 * Проверка наличия данных в справочниках
 */

import { prisma } from "../lib/prisma";

async function checkDictionaries() {
  console.log("\n📚 ПРОВЕРКА СПРАВОЧНИКОВ\n");
  console.log("═".repeat(70));
  
  // Проверяем должности
  const jobTitles = await prisma.jobTitle.findMany({
    take: 10,
    orderBy: { name: 'asc' },
  });
  
  console.log(`\n💼 ДОЛЖНОСТИ (jobTitle):`);
  console.log(`  Всего записей: ${await prisma.jobTitle.count()}`);
  console.log(`  Примеры (первые 10):`);
  jobTitles.forEach(jt => {
    console.log(`    - ${jt.name}`);
  });
  
  // Проверяем профессии
  const professions = await prisma.profession.findMany({
    take: 10,
    orderBy: { name: 'asc' },
  });
  
  console.log(`\n🔧 ПРОФЕССИИ (profession):`);
  console.log(`  Всего записей: ${await prisma.profession.count()}`);
  console.log(`  Примеры (первые 10):`);
  professions.forEach(p => {
    console.log(`    - ${p.name}`);
  });
  
  // Ищем "врач" в должностях
  const doctorJobTitles = await prisma.jobTitle.findMany({
    where: {
      name: {
        contains: 'врач',
        mode: 'insensitive',
      },
    },
    take: 20,
  });
  
  console.log(`\n🔍 ПОИСК "врач" в должностях:`);
  console.log(`  Найдено: ${doctorJobTitles.length}`);
  doctorJobTitles.forEach(jt => {
    console.log(`    - ${jt.name}`);
  });
  
  // Ищем "массажист" в профессиях
  const massageProfessions = await prisma.profession.findMany({
    where: {
      name: {
        contains: 'массажист',
        mode: 'insensitive',
      },
    },
    take: 20,
  });
  
  console.log(`\n🔍 ПОИСК "массажист" в профессиях:`);
  console.log(`  Найдено: ${massageProfessions.length}`);
  massageProfessions.forEach(p => {
    console.log(`    - ${p.name}`);
  });
  
  console.log("\n" + "═".repeat(70));
}

checkDictionaries()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
