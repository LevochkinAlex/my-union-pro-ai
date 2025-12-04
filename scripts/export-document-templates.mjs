import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("📤 Экспорт шаблонов документов...\n");

    const templates = await prisma.documentTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (templates.length === 0) {
      console.log("⚠️ Шаблонов не найдено для экспорта");
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      templates: templates.map((t) => ({
        name: t.name,
        description: t.description,
        type: t.type,
        htmlContent: t.htmlContent,
        cssStyles: t.cssStyles,
        isActive: t.isActive,
        isDefault: t.isDefault,
      })),
    };

    const exportPath = path.join(process.cwd(), "document-templates-export.json");
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), "utf-8");

    console.log(`✅ Экспортировано ${templates.length} шаблонов в ${exportPath}`);
    templates.forEach((t) => {
      console.log(`  - ${t.name} (${t.type})`);
    });
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

