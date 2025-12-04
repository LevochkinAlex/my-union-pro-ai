import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MEMBERSHIP_TEMPLATE_HTML = `<!DOCTYPE html>
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
    работающего(ей) {{jobTitle}}
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
</html>`;

const CONTRIBUTION_TEMPLATE_HTML = `<!DOCTYPE html>
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
      text-align: left;
    }
    .signature {
      margin-top: 2em;
      text-align: left;
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
    Руководителю (главному врачу, директору)<br>
    {{organizationName}}<br>
    {{organizationChairmanFullName}}
  </div>
  
  <div style="text-align: right; margin-bottom: 2em;">
    от {{fullNameGenitive}}<br>
    работающего(ей) {{jobTitle}}
  </div>
  
  <div class="title">
    ЗАЯВЛЕНИЕ.
  </div>
  
  <div class="content">
    На основании ст.28 Федерального закона «О профессиональных союзах, их правах и гарантиях деятельности» прошу ежемесячно удерживать из моей заработной платы членские профсоюзные взносы в размере 1% (один процент) и перечислять их на счет профсоюзной организации с {{currentDate}}
  </div>
  
  <div class="signature">
    Подпись<br>
    <div class="signature-line"></div>
  </div>
</body>
</html>`;

async function main() {
  try {
    console.log("🌱 Создание дефолтных шаблонов документов...\n");

    // Получаем первого суперадмина для createdByUserId
    const superAdmin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { id: true },
    });

    if (!superAdmin) {
      console.error("❌ Не найден суперадминистратор. Создайте хотя бы одного SUPER_ADMIN пользователя.");
      process.exit(1);
    }

    // Проверяем существующие шаблоны
    const existingMembership = await prisma.documentTemplate.findFirst({
      where: {
        type: "MEMBERSHIP_APPLICATION",
        isDefault: true,
      },
    });

    const existingContribution = await prisma.documentTemplate.findFirst({
      where: {
        type: "CONTRIBUTION_APPLICATION",
        isDefault: true,
      },
    });

    // Создаем или обновляем шаблон заявления о вступлении
    if (existingMembership) {
      console.log("📝 Обновление существующего шаблона заявления о вступлении...");
      await prisma.documentTemplate.update({
        where: { id: existingMembership.id },
        data: {
          name: "Заявление о вступлении в профсоюз",
          description: "Шаблон заявления о вступлении в Профсоюз работников здравоохранения РФ",
          htmlContent: MEMBERSHIP_TEMPLATE_HTML,
          isActive: true,
          isDefault: true,
          updatedByUserId: superAdmin.id,
        },
      });
      console.log("✅ Шаблон заявления о вступлении обновлен\n");
    } else {
      console.log("➕ Создание шаблона заявления о вступлении...");
      await prisma.documentTemplate.create({
        data: {
          name: "Заявление о вступлении в профсоюз",
          description: "Шаблон заявления о вступлении в Профсоюз работников здравоохранения РФ",
          type: "MEMBERSHIP_APPLICATION",
          htmlContent: MEMBERSHIP_TEMPLATE_HTML,
          isActive: true,
          isDefault: true,
          createdByUserId: superAdmin.id,
          updatedByUserId: superAdmin.id,
        },
      });
      console.log("✅ Шаблон заявления о вступлении создан\n");
    }

    // Создаем или обновляем шаблон заявления о взносах
    if (existingContribution) {
      console.log("📝 Обновление существующего шаблона заявления о взносах...");
      await prisma.documentTemplate.update({
        where: { id: existingContribution.id },
        data: {
          name: "Заявление о перечислении членских взносов",
          description: "Шаблон заявления о перечислении членских взносов в профсоюз",
          htmlContent: CONTRIBUTION_TEMPLATE_HTML,
          isActive: true,
          isDefault: true,
          updatedByUserId: superAdmin.id,
        },
      });
      console.log("✅ Шаблон заявления о взносах обновлен\n");
    } else {
      console.log("➕ Создание шаблона заявления о взносах...");
      await prisma.documentTemplate.create({
        data: {
          name: "Заявление о перечислении членских взносов",
          description: "Шаблон заявления о перечислении членских взносов в профсоюз",
          type: "CONTRIBUTION_APPLICATION",
          htmlContent: CONTRIBUTION_TEMPLATE_HTML,
          isActive: true,
          isDefault: true,
          createdByUserId: superAdmin.id,
          updatedByUserId: superAdmin.id,
        },
      });
      console.log("✅ Шаблон заявления о взносах создан\n");
    }

    console.log("✨ Дефолтные шаблоны документов успешно созданы/обновлены!");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

