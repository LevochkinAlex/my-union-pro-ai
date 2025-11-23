import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function addColumn() {
  try {
    console.log("📝 Добавление колонки childrenBirthDates...");
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "childrenBirthDates" TEXT;
    `);
    
    console.log("✅ Колонка childrenBirthDates добавлена успешно!");
    
  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addColumn();

