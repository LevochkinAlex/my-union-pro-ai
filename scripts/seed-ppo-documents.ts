/**
 * Скрипт для добавления всех шаблонов документов профкома:
 * - Повестка дня заседания
 * - Протокол заседания
 * - Постановление профкома
 * - Выписка из протокола
 * 
 * Запуск: npx ts-node scripts/seed-ppo-documents.ts
 */

import { PrismaClient, DocumentType } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================================
// ШАБЛОН 1: ПОВЕСТКА ДНЯ ЗАСЕДАНИЯ ПРОФКОМА
// ============================================================================
const AGENDA_TEMPLATE_HTML = `
<div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px;">
  
  <!-- Шапка -->
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
      ПОВЕСТКА ДНЯ
    </h1>
    <p style="font-size: 14px; margin: 10px 0;">
      заседания профсоюзного комитета
    </p>
  </div>
  
  <!-- Дата, время, место -->
  <div style="margin: 30px 0; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
    <table style="width: 100%;">
      <tr>
        <td style="padding: 5px 0;"><strong>Дата проведения:</strong></td>
        <td style="padding: 5px 0;">{{meetingDate}}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0;"><strong>Время начала:</strong></td>
        <td style="padding: 5px 0;">{{meetingTime}}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0;"><strong>Место проведения:</strong></td>
        <td style="padding: 5px 0;">{{meetingPlace}}</td>
      </tr>
    </table>
  </div>
  
  <!-- Список вопросов -->
  <div style="margin: 30px 0;">
    <h2 style="font-size: 16px; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
      ВОПРОСЫ ДЛЯ РАССМОТРЕНИЯ:
    </h2>
    <div style="margin-top: 15px;">
      {{agendaItems}}
    </div>
  </div>
  
  <!-- Приглашённые -->
  <div style="margin: 30px 0;">
    <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Приглашённые:</h3>
    <div style="margin-left: 20px;">
      {{votingParticipants}}
    </div>
  </div>
  
  <!-- Подпись -->
  <div style="margin-top: 60px;">
    <table style="width: 100%;">
      <tr>
        <td style="width: 50%;">
          <p style="margin: 0;">Председатель профкома</p>
        </td>
        <td style="width: 50%; text-align: right;">
          <p style="margin: 0;">{{organizationChairmanName}}</p>
        </td>
      </tr>
    </table>
  </div>
  
  <!-- Дата составления -->
  <div style="margin-top: 30px; text-align: right; font-size: 12px; color: #666;">
    <p>Дата составления: {{currentDate}}</p>
  </div>
  
</div>
`;

// ============================================================================
// ШАБЛОН 2: ПРОТОКОЛ ЗАСЕДАНИЯ ПРОФКОМА
// ============================================================================
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

// ============================================================================
// ШАБЛОН 3: ПОСТАНОВЛЕНИЕ ПРОФСОЮЗНОГО КОМИТЕТА
// ============================================================================
const RESOLUTION_TEMPLATE_HTML = `
<div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px;">
  
  <!-- Шапка -->
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
  <div style="text-align: center; margin: 40px 0; padding: 20px; border: 2px solid #333;">
    <h1 style="font-size: 20px; font-weight: bold; margin: 0; text-transform: uppercase;">
      ПОСТАНОВЛЕНИЕ № {{resolutionNumber}}
    </h1>
    <p style="font-size: 14px; margin: 10px 0;">
      профсоюзного комитета
    </p>
  </div>
  
  <!-- Дата и номер протокола -->
  <div style="margin: 30px 0;">
    <table style="width: 100%;">
      <tr>
        <td style="width: 50%;"><strong>Дата:</strong> {{meetingDate}}</td>
        <td style="width: 50%; text-align: right;"><strong>Протокол №</strong> {{protocolNumber}}</td>
      </tr>
    </table>
  </div>
  
  <!-- Текст постановления -->
  <div style="margin: 30px 0;">
    <h2 style="font-size: 14px; font-weight: bold; margin-bottom: 20px;">
      О: [тема постановления]
    </h2>
    
    <p style="margin: 15px 0; text-align: justify;">
      Рассмотрев вопрос [описание], заслушав [докладчиков], профсоюзный комитет
    </p>
    
    <h3 style="font-size: 16px; font-weight: bold; text-align: center; margin: 30px 0;">
      ПОСТАНОВЛЯЕТ:
    </h3>
    
    <ol style="margin: 20px 0; padding-left: 30px;">
      <li style="margin: 10px 0;">[Пункт 1 постановления]</li>
      <li style="margin: 10px 0;">[Пункт 2 постановления]</li>
      <li style="margin: 10px 0;">Контроль за выполнением постановления возложить на [ФИО ответственного]</li>
    </ol>
  </div>
  
  <!-- Результаты голосования -->
  <div style="margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 5px;">
    <p style="font-weight: bold; margin-bottom: 10px;">Результаты голосования:</p>
    <table style="width: 50%;">
      <tr>
        <td style="padding: 5px 0;">«За»:</td>
        <td style="padding: 5px 0;">___ голосов</td>
      </tr>
      <tr>
        <td style="padding: 5px 0;">«Против»:</td>
        <td style="padding: 5px 0;">___ голосов</td>
      </tr>
      <tr>
        <td style="padding: 5px 0;">«Воздержались»:</td>
        <td style="padding: 5px 0;">___ голосов</td>
      </tr>
    </table>
    <p style="margin-top: 15px; font-weight: bold;">Постановление принято.</p>
  </div>
  
  <!-- Подписи -->
  <div style="margin-top: 60px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="width: 50%; padding: 20px 0; vertical-align: bottom;">
          <p style="margin: 0;">Председатель профкома</p>
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

// ============================================================================
// ШАБЛОН 4: ВЫПИСКА ИЗ ПРОТОКОЛА
// ============================================================================
const PROTOCOL_EXTRACT_TEMPLATE_HTML = `
<div style="font-family: 'Times New Roman', Times, serif; font-size: 14px; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px;">
  
  <!-- Шапка -->
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
      ВЫПИСКА
    </h1>
    <p style="font-size: 14px; margin: 10px 0;">
      из протокола № {{protocolNumber}} заседания профсоюзного комитета
    </p>
    <p style="font-size: 14px; margin: 5px 0;">
      от {{meetingDate}}
    </p>
  </div>
  
  <!-- Информация о заседании -->
  <div style="margin: 30px 0; padding: 15px; border: 1px solid #ddd; background-color: #fafafa;">
    <p><strong>Присутствовали:</strong> {{presentMembers}}</p>
    <p><strong>Председательствовал:</strong> {{organizationChairmanName}}</p>
    <p><strong>Секретарь:</strong> {{secretaryName}}</p>
  </div>
  
  <!-- Рассматриваемый вопрос -->
  <div style="margin: 30px 0;">
    <h2 style="font-size: 14px; font-weight: bold; margin-bottom: 15px;">
      РАССМАТРИВАЛСЯ ВОПРОС:
    </h2>
    <p style="margin: 10px 0; padding-left: 20px; border-left: 3px solid #333;">
      [Формулировка вопроса повестки дня]
    </p>
  </div>
  
  <!-- СЛУШАЛИ -->
  <div style="margin: 20px 0;">
    <p style="font-weight: bold;">СЛУШАЛИ:</p>
    <p style="margin: 10px 0; padding-left: 20px;">
      [ФИО докладчика] – [краткое содержание выступления]
    </p>
  </div>
  
  <!-- ПОСТАНОВИЛИ -->
  <div style="margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 5px;">
    <p style="font-weight: bold; font-size: 16px; margin-bottom: 15px;">ПОСТАНОВИЛИ:</p>
    <p style="margin: 10px 0;">
      [Текст принятого решения]
    </p>
  </div>
  
  <!-- Результаты голосования -->
  <div style="margin: 20px 0;">
    <p style="font-weight: bold; margin-bottom: 10px;">Голосовали:</p>
    <p style="margin: 5px 0;">«За» – ___ человек</p>
    <p style="margin: 5px 0;">«Против» – ___ человек</p>
    <p style="margin: 5px 0;">«Воздержались» – ___ человек</p>
    <p style="margin-top: 10px; font-style: italic;">Решение принято единогласно / большинством голосов.</p>
  </div>
  
  <!-- Верность подтверждения -->
  <div style="margin: 40px 0; text-align: center; padding: 15px; border: 1px dashed #999;">
    <p style="font-style: italic;">Выписка верна</p>
  </div>
  
  <!-- Подписи -->
  <div style="margin-top: 40px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="width: 50%; padding: 20px 0; vertical-align: bottom;">
          <p style="margin: 0;">Председатель профкома</p>
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
  
  <!-- Печать и дата -->
  <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: center;">
    <p style="font-size: 12px; color: #666; font-style: italic;">М.П.</p>
    <p style="font-size: 12px; color: #666;">Дата выдачи: {{currentDate}}</p>
  </div>
  
</div>
`;

// ============================================================================
// CSS СТИЛИ (общие для всех шаблонов)
// ============================================================================
const COMMON_CSS = `
@media print {
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14px;
    line-height: 1.6;
  }
  
  h1, h2, h3 {
    page-break-after: avoid;
  }
  
  table {
    page-break-inside: avoid;
  }
}

@page {
  size: A4;
  margin: 2cm;
}
`;

// ============================================================================
// СПИСОК ВСЕХ ШАБЛОНОВ
// ============================================================================
const TEMPLATES = [
  {
    name: "Повестка дня заседания профкома",
    description: "Шаблон повестки дня для заседания профсоюзного комитета",
    type: DocumentType.AGENDA,
    htmlContent: AGENDA_TEMPLATE_HTML,
    cssStyles: COMMON_CSS,
  },
  {
    name: "Протокол заседания профсоюзного комитета",
    description: "Стандартный шаблон протокола заседания профкома с переменными для автозаполнения",
    type: DocumentType.PROTOCOL,
    htmlContent: PROTOCOL_TEMPLATE_HTML,
    cssStyles: COMMON_CSS,
  },
  {
    name: "Постановление профсоюзного комитета",
    description: "Шаблон постановления профкома по результатам заседания",
    type: DocumentType.RESOLUTION,
    htmlContent: RESOLUTION_TEMPLATE_HTML,
    cssStyles: COMMON_CSS,
  },
  {
    name: "Выписка из протокола",
    description: "Шаблон выписки из протокола заседания профкома",
    type: DocumentType.PROTOCOL_EXTRACT,
    htmlContent: PROTOCOL_EXTRACT_TEMPLATE_HTML,
    cssStyles: COMMON_CSS,
  },
];

// ============================================================================
// ФУНКЦИЯ SEED
// ============================================================================
async function seedPPODocuments() {
  console.log("🚀 Начинаю добавление шаблонов документов профкома...\n");
  console.log("=" .repeat(60) + "\n");

  try {
    for (const template of TEMPLATES) {
      console.log(`📄 Обработка: ${template.name}`);
      
      // Проверяем существование шаблона
      const existing = await prisma.documentTemplate.findFirst({
        where: {
          type: template.type,
          name: template.name,
        },
      });

      if (existing) {
        console.log(`   ⚠️ Шаблон уже существует, обновляю...`);
        
        await prisma.documentTemplate.update({
          where: { id: existing.id },
          data: {
            htmlContent: template.htmlContent,
            cssStyles: template.cssStyles,
            description: template.description,
            updatedAt: new Date(),
          },
        });
        
        console.log(`   ✅ Обновлён (ID: ${existing.id})`);
      } else {
        // Снимаем флаг isDefault с других шаблонов этого типа
        await prisma.documentTemplate.updateMany({
          where: {
            type: template.type,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });

        const created = await prisma.documentTemplate.create({
          data: {
            name: template.name,
            description: template.description,
            type: template.type,
            htmlContent: template.htmlContent,
            cssStyles: template.cssStyles,
            isActive: true,
            isDefault: true,
          },
        });
        
        console.log(`   ✅ Создан (ID: ${created.id})`);
      }
      
      console.log("");
    }

    // Выводим итоговую статистику
    console.log("=" .repeat(60));
    console.log("\n📊 Итоговая статистика шаблонов:\n");
    
    const stats = await prisma.documentTemplate.groupBy({
      by: ["type"],
      _count: { type: true },
      where: {
        type: {
          in: ["AGENDA", "PROTOCOL", "RESOLUTION", "PROTOCOL_EXTRACT"],
        },
      },
    });
    
    for (const stat of stats) {
      console.log(`   ${stat.type}: ${stat._count.type} шаблон(ов)`);
    }

    console.log("\n✨ Готово! Все шаблоны доступны в админке: /admin/document-templates");
    console.log("\n📝 Доступные переменные для шаблонов:");
    console.log("   {{organizationName}} - Название организации");
    console.log("   {{organizationChairmanName}} - ФИО председателя");
    console.log("   {{secretaryName}} - ФИО секретаря");
    console.log("   {{meetingDate}} - Дата заседания");
    console.log("   {{meetingTime}} - Время заседания");
    console.log("   {{meetingPlace}} - Место проведения");
    console.log("   {{protocolNumber}} - Номер протокола");
    console.log("   {{resolutionNumber}} - Номер постановления");
    console.log("   {{agendaItems}} - Пункты повестки дня");
    console.log("   {{presentMembers}} - Присутствующие");
    console.log("   {{absentMembers}} - Отсутствующие");
    console.log("   {{votingParticipants}} - Участники голосования");
    console.log("   {{currentDate}} - Текущая дата");
    
  } catch (error) {
    console.error("❌ Ошибка:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedPPODocuments();
