/**
 * Скрипт для добавления шаблона "Протокол заседания профсоюзного комитета"
 * Запуск: npx ts-node scripts/seed-protocol-template.ts
 */

import { PrismaClient, DocumentType } from "@prisma/client";

const prisma = new PrismaClient();

const PROTOCOL_TEMPLATE_HTML = `
<div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.5; max-width: 800px; margin: 0 auto; padding: 20px;">
  
  <!-- Шапка организации -->
  <div style="text-align: center; margin-bottom: 30px;">
    <p style="font-weight: bold; font-size: 16px; margin: 0;">
      Первичная профсоюзная организация
    </p>
    <p style="font-size: 16px; margin: 5px 0;">
      {{organizationName}}
    </p>
    <p style="font-size: 14px; margin: 5px 0; color: #555;">
      Профсоюза работников здравоохранения Российской Федерации
    </p>
  </div>
  
  <!-- Название документа -->
  <div style="text-align: center; margin: 40px 0;">
    <h1 style="font-size: 18px; font-weight: bold; margin: 0; text-transform: uppercase;">
      ПРОТОКОЛ № {{protocolNumber}}
    </h1>
    <p style="font-size: 14px; margin: 10px 0;">
      заседания профсоюзного комитета
    </p>
  </div>
  
  <!-- Дата и место -->
  <div style="display: flex; justify-content: space-between; margin: 30px 0;">
    <div>
      <span style="font-weight: bold;">Дата:</span> {{meetingDate}}
    </div>
    <div>
      <span style="font-weight: bold;">Время:</span> {{meetingTime}}
    </div>
  </div>
  
  <div style="margin-bottom: 20px;">
    <span style="font-weight: bold;">Место проведения:</span> {{meetingPlace}}
  </div>
  
  <!-- Присутствовали -->
  <div style="margin: 20px 0;">
    <p style="font-weight: bold; margin-bottom: 10px;">Присутствовали:</p>
    <div style="margin-left: 20px;">
      {{presentMembers}}
    </div>
  </div>
  
  <!-- Отсутствовали -->
  <div style="margin: 20px 0;">
    <p style="font-weight: bold; margin-bottom: 10px;">Отсутствовали:</p>
    <div style="margin-left: 20px;">
      {{absentMembers}}
    </div>
  </div>
  
  <!-- Председатель и секретарь -->
  <div style="margin: 30px 0; border-top: 1px solid #ccc; padding-top: 20px;">
    <p><span style="font-weight: bold;">Председательствовал:</span> {{organizationChairmanName}}</p>
    <p><span style="font-weight: bold;">Секретарь:</span> {{secretaryName}}</p>
  </div>
  
  <!-- Кворум -->
  <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-left: 3px solid #4CAF50;">
    <p style="margin: 0; font-style: italic;">
      Кворум имеется. Заседание правомочно.
    </p>
  </div>
  
  <!-- Повестка дня -->
  <div style="margin: 30px 0;">
    <h2 style="font-size: 16px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #333; padding-bottom: 10px;">
      ПОВЕСТКА ДНЯ:
    </h2>
    <div style="margin-top: 15px;">
      {{agendaItems}}
    </div>
  </div>
  
  <!-- Раздел для вопросов (шаблонная секция) -->
  <div style="margin: 40px 0;">
    <h3 style="font-size: 14px; font-weight: bold;">
      По первому вопросу повестки дня:
    </h3>
    <p style="margin: 10px 0;"><span style="font-weight: bold;">СЛУШАЛИ:</span> [ФИО докладчика] – [краткое содержание выступления]</p>
    <p style="margin: 10px 0;"><span style="font-weight: bold;">ВЫСТУПИЛИ:</span> [ФИО выступающих и краткое содержание]</p>
    
    <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5;">
      <p style="font-weight: bold; margin-bottom: 10px;">ГОЛОСОВАЛИ:</p>
      <p style="margin: 5px 0;">«За» – ___ человек</p>
      <p style="margin: 5px 0;">«Против» – ___ человек</p>
      <p style="margin: 5px 0;">«Воздержались» – ___ человек</p>
    </div>
    
    <p style="margin: 15px 0;"><span style="font-weight: bold;">ПОСТАНОВИЛИ:</span> [текст решения]</p>
  </div>
  
  <!-- Подписи -->
  <div style="margin-top: 60px; page-break-inside: avoid;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="width: 50%; padding: 20px 0; vertical-align: bottom;">
          <p style="margin: 0;">Председатель</p>
          <p style="border-bottom: 1px solid #333; margin: 30px 0 5px 0; width: 80%;"></p>
          <p style="margin: 0; font-size: 12px;">{{organizationChairmanName}}</p>
        </td>
        <td style="width: 50%; padding: 20px 0; vertical-align: bottom;">
          <p style="margin: 0;">Секретарь</p>
          <p style="border-bottom: 1px solid #333; margin: 30px 0 5px 0; width: 80%;"></p>
          <p style="margin: 0; font-size: 12px;">{{secretaryName}}</p>
        </td>
      </tr>
    </table>
  </div>
  
  <!-- Печать -->
  <div style="margin-top: 30px; text-align: center;">
    <p style="font-size: 12px; color: #666; font-style: italic;">М.П.</p>
  </div>
  
</div>
`;

const PROTOCOL_TEMPLATE_CSS = `
/* Стили для печати протокола */
@media print {
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14px;
    line-height: 1.5;
  }
  
  h1, h2, h3 {
    page-break-after: avoid;
  }
  
  table {
    page-break-inside: avoid;
  }
  
  .signature-block {
    page-break-inside: avoid;
  }
}

/* Стили для экрана */
@page {
  size: A4;
  margin: 2cm;
}
`;

async function seedProtocolTemplate() {
  console.log("🚀 Начинаю добавление шаблона 'Протокол заседания'...\n");

  try {
    // Проверяем, есть ли уже такой шаблон
    const existingTemplate = await prisma.documentTemplate.findFirst({
      where: {
        type: "PROTOCOL",
        name: {
          contains: "Протокол заседания",
        },
      },
    });

    if (existingTemplate) {
      console.log(`⚠️ Шаблон "Протокол заседания" уже существует (ID: ${existingTemplate.id})`);
      console.log("   Обновляю существующий шаблон...");
      
      const updated = await prisma.documentTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          htmlContent: PROTOCOL_TEMPLATE_HTML,
          cssStyles: PROTOCOL_TEMPLATE_CSS,
          updatedAt: new Date(),
        },
      });
      
      console.log(`✅ Шаблон обновлён: ${updated.name}`);
    } else {
      // Создаём новый шаблон
      const newTemplate = await prisma.documentTemplate.create({
        data: {
          name: "Протокол заседания профсоюзного комитета",
          description: "Стандартный шаблон протокола заседания профкома с переменными для автозаполнения",
          type: DocumentType.PROTOCOL,
          htmlContent: PROTOCOL_TEMPLATE_HTML,
          cssStyles: PROTOCOL_TEMPLATE_CSS,
          isActive: true,
          isDefault: true,
        },
      });
      
      console.log(`✅ Создан новый шаблон: ${newTemplate.name}`);
      console.log(`   ID: ${newTemplate.id}`);
    }

    // Выводим список всех шаблонов типа PROTOCOL
    const allProtocolTemplates = await prisma.documentTemplate.findMany({
      where: { type: "PROTOCOL" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isActive: true,
        updatedAt: true,
      },
    });

    console.log("\n📋 Все шаблоны типа PROTOCOL:");
    allProtocolTemplates.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.name} (${t.isDefault ? "по умолчанию" : ""}) - ${t.isActive ? "активен" : "неактивен"}`);
    });

    console.log("\n✨ Готово! Шаблон доступен в админке: /admin/document-templates");
    
  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedProtocolTemplate();
