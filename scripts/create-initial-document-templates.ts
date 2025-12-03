#!/usr/bin/env tsx

/**
 * Скрипт для создания начальных шаблонов документов
 * Использует существующие HTML шаблоны из lib/documents.ts
 */

import { PrismaClient, DocumentType } from "@prisma/client";

const prisma = new PrismaClient();

// Шаблон заявления о вступлении
const MEMBERSHIP_APPLICATION_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14pt;
      line-height: 1.5;
      margin: 2cm;
      color: #000;
    }
    .header {
      text-align: right;
      margin-bottom: 2em;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
    .content {
      margin-bottom: 1em;
      font-size: 14pt;
    }
    .footer {
      margin-top: 2em;
      display: flex;
      justify-content: space-between;
    }
    .date {
      text-align: left;
      font-size: 14pt;
    }
    .signature {
      text-align: right;
      font-size: 14pt;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 200px;
      display: inline-block;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    Председателю {{organizationName}}<br>
    от {{fullNameGenitive}}.<br>
    {{jobTitle}}
  </div>
  
  <div class="title">
    ЗАЯВЛЕНИЕ.
  </div>
  
  <div class="content">
    Прошу принять меня в Профсоюз работников здравоохранения РФ с {{currentDate}}
  </div>
  
  <div class="content">
    С уставом Профсоюза работников здравоохранения РФ ознакомлен(а) и обязуюсь исполнять.
  </div>
  
  <div class="footer">
    <div class="date">
      {{currentDate}}
    </div>
    <div class="signature">
      Личная подпись<br>
      <div class="signature-line"></div>
    </div>
  </div>
</body>
</html>
`;

// Шаблон заявления о взносах
const CONTRIBUTION_APPLICATION_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 14pt;
      line-height: 1.5;
      margin: 2cm;
      color: #000;
    }
    .header {
      text-align: right;
      margin-bottom: 2em;
    }
    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 1.5em;
      text-transform: uppercase;
    }
    .content {
      margin-bottom: 1em;
      font-size: 14pt;
      text-align: justify;
      text-indent: 30px;
    }
    .section-title {
      font-weight: bold;
      text-decoration: underline;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    .footer {
      margin-top: 2em;
      display: flex;
      justify-content: space-between;
    }
    .date {
      text-align: left;
      font-size: 14pt;
    }
    .signature {
      text-align: right;
      font-size: 14pt;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 200px;
      display: inline-block;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    Председателю Межрегиональной общественной<br>
    организации профсоюза работников здравоохранения<br>
    от {{fullName}}
  </div>
  
  <div class="title">
    ЗАЯВЛЕНИЕ<br>
    о перечислении членских взносов
  </div>
  
  <div class="content">
    Прошу производить ежемесячное удержание из моей заработной платы членских взносов в размере 1% (один процент) и перечислять их в Межрегиональную общественную организацию профсоюза работников здравоохранения (МООП РЗ).
  </div>
  
  <div class="section-title">
    Реквизиты для перечисления взносов:
  </div>
  <div class="content">
    Получатель: Межрегиональная общественная организация профсоюза работников здравоохранения<br>
    ИНН: [указать ИНН]<br>
    КПП: [указать КПП]<br>
    Расчетный счет: [указать р/с]<br>
    Банк: [указать банк]<br>
    БИК: [указать БИК]<br>
    Корр. счет: [указать к/с]
  </div>
  
  <div class="section-title">
    Мои данные:
  </div>
  <div class="content">
    ФИО: {{fullName}}<br>
    Дата рождения: {{dateOfBirth}}<br>
    Должность: {{jobTitle}}<br>
    Организация: {{organizationName}}<br>
    Адрес: {{address}}<br>
    Телефон: {{phone}}
  </div>
  
  <div class="footer">
    <div class="date">
      Дата: {{currentDate}}
    </div>
    <div class="signature">
      Подпись: __________________ / {{fullName}} /
    </div>
  </div>
</body>
</html>
`;

async function createInitialTemplates() {
  console.log("📝 Создание начальных шаблонов документов...\n");

  try {
    // Проверяем, есть ли уже шаблоны
    const existingTemplates = await prisma.documentTemplate.findMany({
      where: {
        type: {
          in: [DocumentType.MEMBERSHIP_APPLICATION, DocumentType.CONTRIBUTION_APPLICATION],
        },
      },
    });

    if (existingTemplates.length > 0) {
      console.log("⚠️  Шаблоны уже существуют. Пропускаем создание.");
      console.log(`   Найдено шаблонов: ${existingTemplates.length}`);
      return;
    }

    // Создаем шаблон заявления о вступлении
    const membershipTemplate = await prisma.documentTemplate.create({
      data: {
        name: "Заявление о вступлении в профсоюз",
        description: "Шаблон заявления о вступлении в Профсоюз работников здравоохранения РФ",
        type: DocumentType.MEMBERSHIP_APPLICATION,
        htmlContent: MEMBERSHIP_APPLICATION_TEMPLATE,
        cssStyles: null,
        isActive: true,
        isDefault: true,
      },
    });

    console.log(`✅ Создан шаблон: ${membershipTemplate.name} (ID: ${membershipTemplate.id})`);

    // Создаем шаблон заявления о взносах
    const duesTemplate = await prisma.documentTemplate.create({
      data: {
        name: "Заявление о перечислении членских взносов",
        description: "Шаблон заявления о перечислении членских взносов в МООП РЗ",
        type: DocumentType.CONTRIBUTION_APPLICATION,
        htmlContent: CONTRIBUTION_APPLICATION_TEMPLATE,
        cssStyles: null,
        isActive: true,
        isDefault: true,
      },
    });

    console.log(`✅ Создан шаблон: ${duesTemplate.name} (ID: ${duesTemplate.id})`);

    console.log("\n✅ Начальные шаблоны успешно созданы!");
    console.log("\n📋 Доступные переменные для шаблонов:");
    console.log("   - {{firstName}} - Имя");
    console.log("   - {{lastName}} - Фамилия");
    console.log("   - {{middleName}} - Отчество");
    console.log("   - {{fullName}} - Полное ФИО");
    console.log("   - {{fullNameGenitive}} - ФИО в родительном падеже");
    console.log("   - {{phone}} - Телефон");
    console.log("   - {{email}} - Email");
    console.log("   - {{address}} - Адрес");
    console.log("   - {{jobTitle}} - Должность");
    console.log("   - {{profession}} - Профессия");
    console.log("   - {{education}} - Образование");
    console.log("   - {{organizationName}} - Название организации");
    console.log("   - {{organizationInn}} - ИНН организации");
    console.log("   - {{dateOfBirth}} - Дата рождения (ДД.ММ.ГГГГ)");
    console.log("   - {{currentDate}} - Текущая дата (ДД.ММ.ГГГГ)");
  } catch (error) {
    console.error("❌ Ошибка при создании шаблонов:", error);
    throw error;
  }
}

createInitialTemplates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

