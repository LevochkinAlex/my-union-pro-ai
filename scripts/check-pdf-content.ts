import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function checkPDFContent(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        documents: {
          where: {
            type: "MEMBERSHIP_APPLICATION",
          },
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        }
      }
    });

    if (!user || !user.documents[0]) {
      console.log("❌ Документ не найден");
      return;
    }

    const doc = user.documents[0];
    console.log(`\n📄 Документ: ${doc.title}`);
    console.log(`  ID: ${doc.id}`);
    console.log(`  Путь: ${doc.filePath}`);
    console.log(`  Обновлен: ${doc.updatedAt}`);

    // Читаем PDF файл
    const filePath = path.join(process.cwd(), "public", doc.filePath);
    console.log(`\n📂 Полный путь: ${filePath}`);
    
    try {
      const buffer = await fs.readFile(filePath);
      const content = buffer.toString('latin1');
      
      // Ищем ФИО в содержимом PDF
      const namePattern = /(Еременко[а-я]*\s+Виталий[а-я]*\s+Николаевич[а-я]*)/g;
      const matches = content.match(namePattern);
      
      console.log(`\n🔍 Найдено упоминаний ФИО: ${matches ? matches.length : 0}`);
      if (matches) {
        matches.forEach((match, index) => {
          console.log(`  ${index + 1}. ${match}`);
        });
      }
      
      // Ищем должность
      if (content.includes("Зампред")) {
        if (content.includes("работающего(ей) Зампред")) {
          console.log(`\n✅ Должность правильная: "работающего(ей) Зампред"`);
        } else {
          console.log(`\n❌ Должность без приставки: "Зампред"`);
        }
      }
      
    } catch (error) {
      console.error(`\n❌ Ошибка чтения файла:`, error);
    }

  } catch (error) {
    console.error("❌ Ошибка:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPDFContent("ceo@yappix.ru");

