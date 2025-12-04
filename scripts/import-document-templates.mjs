import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  try {
    const importPath = process.argv[2] || path.join(process.cwd(), "document-templates-export.json");

    console.log(`📥 Импорт шаблонов документов из ${importPath}...\n`);

    const fileContent = await fs.readFile(importPath, "utf-8");
    const exportData = JSON.parse(fileContent);

    if (!exportData.templates || !Array.isArray(exportData.templates)) {
      throw new Error("Неверный формат файла экспорта");
    }

    // Получаем первого суперадмина
    const superAdmin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { id: true },
    });

    if (!superAdmin) {
      throw new Error("Не найден суперадминистратор");
    }

    let created = 0;
    let updated = 0;

    for (const templateData of exportData.templates) {
      // Проверяем существующий шаблон по типу и isDefault
      const existing = await prisma.documentTemplate.findFirst({
        where: {
          type: templateData.type,
          isDefault: templateData.isDefault || false,
        },
      });

      if (existing) {
        console.log(`📝 Обновление: ${templateData.name} (${templateData.type})`);
        await prisma.documentTemplate.update({
          where: { id: existing.id },
          data: {
            name: templateData.name,
            description: templateData.description,
            htmlContent: templateData.htmlContent,
            cssStyles: templateData.cssStyles,
            isActive: templateData.isActive !== false,
            isDefault: templateData.isDefault || false,
            updatedByUserId: superAdmin.id,
          },
        });
        updated++;
      } else {
        console.log(`➕ Создание: ${templateData.name} (${templateData.type})`);
        await prisma.documentTemplate.create({
          data: {
            name: templateData.name,
            description: templateData.description,
            type: templateData.type,
            htmlContent: templateData.htmlContent,
            cssStyles: templateData.cssStyles,
            isActive: templateData.isActive !== false,
            isDefault: templateData.isDefault || false,
            createdByUserId: superAdmin.id,
            updatedByUserId: superAdmin.id,
          },
        });
        created++;
      }
    }

    console.log(`\n✨ Импорт завершен!`);
    console.log(`  Создано: ${created}`);
    console.log(`  Обновлено: ${updated}`);
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

