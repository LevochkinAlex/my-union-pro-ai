/**
 * Seed для шаблонов отчётности профсоюзов
 * Создаёт Форму 2 (Статистическая отчётность ППО)
 * 
 * Запуск: npx ts-node prisma/seed-reports.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Структура Формы 2 - Статистическая отчётность ППО
const FORM2_TEMPLATE = {
  code: "form2",
  name: "Статистическая отчётность первичной профсоюзной организации",
  description: "Форма 2. Ежегодный отчёт о состоянии профсоюзного членства, кадрах и активе",
  periodicity: "ANNUAL" as const,
  forOrganizationTypes: ["PRIMARY"],
  sections: [
    {
      code: "section1",
      title: "I. Общие сведения",
      order: 1,
      fields: [
        {
          code: "f2_s1_union_name",
          name: "union_name",
          title: "Наименование профсоюза",
          fieldType: "string",
          isRequired: true,
          autoFillFrom: "organization.parent.name",
          order: 1,
        },
        {
          code: "f2_s1_org_name",
          name: "org_name",
          title: "Наименование первичной профсоюзной организации",
          fieldType: "string",
          isRequired: true,
          autoFillFrom: "organization.name",
          order: 2,
        },
        {
          code: "f2_s1_address",
          name: "address",
          title: "Адрес первичной профсоюзной организации",
          fieldType: "string",
          isRequired: true,
          autoFillFrom: "organization.address",
          order: 3,
        },
        {
          code: "f2_s1_chairman",
          name: "chairman",
          title: "Ф.И.О. председателя первичной профсоюзной организации",
          fieldType: "string",
          isRequired: true,
          autoFillFrom: "organization.chairmanName",
          order: 4,
        },
        {
          code: "f2_s1_phone",
          name: "phone",
          title: "Телефон",
          fieldType: "string",
          autoFillFrom: "organization.phone",
          order: 5,
        },
        {
          code: "f2_s1_email",
          name: "email",
          title: "E-mail",
          fieldType: "string",
          autoFillFrom: "organization.email",
          order: 6,
        },
      ],
    },
    {
      code: "section2",
      title: "II. Профсоюзное членство",
      order: 2,
      fields: [
        {
          code: "f2_s2_total_workers",
          name: "total_workers",
          title: "Всего работающих",
          num: "1",
          fieldType: "integer",
          isRequired: true,
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 1,
        },
        {
          code: "f2_s2_union_members_workers",
          name: "union_members_workers",
          title: "Из них членов профсоюза",
          num: "2",
          fieldType: "integer",
          isRequired: true,
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 2,
        },
        {
          code: "f2_s2_new_members_workers",
          name: "new_members_workers",
          title: "в том числе, впервые принятых в члены профсоюза за год",
          num: "3",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 3,
        },
        {
          code: "f2_s2_total_students",
          name: "total_students",
          title: "Всего студентов, учащихся учебных заведений",
          num: "4",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 4,
        },
        {
          code: "f2_s2_union_members_students",
          name: "union_members_students",
          title: "Из них членов профсоюза",
          num: "5",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 5,
        },
        {
          code: "f2_s2_new_members_students",
          name: "new_members_students",
          title: "в том числе, впервые принятых в члены профсоюза",
          num: "6",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 6,
        },
        {
          code: "f2_s2_total_all",
          name: "total_all",
          title: "Всего работающих, студентов и учащихся",
          num: "7",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          formula: "f2_s2_total_workers + f2_s2_total_students",
          order: 7,
        },
        {
          code: "f2_s2_union_members_all",
          name: "union_members_all",
          title: "Из них членов профсоюза",
          num: "8",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          formula: "f2_s2_union_members_workers + f2_s2_union_members_students",
          order: 8,
        },
        {
          code: "f2_s2_coverage_percent",
          name: "coverage_percent",
          title: "Процент охвата профсоюзным членством работающих и учащихся",
          num: "9",
          fieldType: "decimal",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          formula: "(f2_s2_union_members_all / f2_s2_total_all) * 100",
          help: "Рассчитывается автоматически",
          order: 9,
        },
        {
          code: "f2_s2_pensioners",
          name: "pensioners",
          title: "Членов профсоюза – неработающих пенсионеров",
          num: "10",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 2,
          columnHeaders: ["На начало года", "На конец года"],
          order: 10,
        },
        {
          code: "f2_s2_unemployed",
          name: "unemployed",
          title: "Членов профсоюза - временно не работающих",
          num: "11",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 11,
        },
        {
          code: "f2_s2_total_members",
          name: "total_members",
          title: "Всего членов профсоюза",
          num: "12",
          fieldType: "integer",
          isRequired: true,
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 12,
        },
        {
          code: "f2_s2_left_voluntarily",
          name: "left_voluntarily",
          title: "Вышли из профсоюза по собственному желанию",
          num: "13",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 13,
        },
        {
          code: "f2_s2_excluded",
          name: "excluded",
          title: "Исключено из профсоюза",
          num: "14",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 14,
        },
      ],
    },
    {
      code: "section3",
      title: "III. Профсоюзные кадры и актив",
      order: 3,
      fields: [
        {
          code: "f2_s3_chairman",
          name: "chairman",
          title: "Председатель первичной профсоюзной организации",
          num: "1",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 1,
        },
        {
          code: "f2_s3_chairman_fulltime",
          name: "chairman_fulltime",
          title: "В том числе: освобожденный (штатный) председатель первичной профсоюзной организации",
          num: "1.1",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 2,
        },
        {
          code: "f2_s3_chairman_small",
          name: "chairman_small",
          title: "В том числе: председатель малочисленной (до 15 чел.) первичной профорганизации",
          num: "1.2",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 3,
        },
        {
          code: "f2_s3_committee_members",
          name: "committee_members",
          title: "Членов профкома (кроме председателя)",
          num: "2",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 4,
        },
        {
          code: "f2_s3_committee_members_fulltime",
          name: "committee_members_fulltime",
          title: "В том числе, освобожденных (штатных) членов профкома (кроме председателя)",
          num: "2.1",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 5,
        },
        {
          code: "f2_s3_commission_members",
          name: "commission_members",
          title: "Членов всех комиссий профкома",
          num: "3",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 6,
        },
        {
          code: "f2_s3_revision_commission",
          name: "revision_commission",
          title: "Членов ревизионной комиссии первичной профсоюзной организации",
          num: "4",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 7,
        },
        {
          code: "f2_s3_shop_chairmen",
          name: "shop_chairmen",
          title: "Председателей цеховых профсоюзных организаций, профбюро",
          num: "5",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 8,
        },
        {
          code: "f2_s3_shop_committee_members",
          name: "shop_committee_members",
          title: "Членов цеховых комитетов, профбюро (кроме председателей)",
          num: "6",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 9,
        },
        {
          code: "f2_s3_group_organizers",
          name: "group_organizers",
          title: "Профгрупоргов",
          num: "7",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 3,
          columnHeaders: ["На начало года", "На конец года", "Из них женщины"],
          order: 10,
        },
      ],
    },
    {
      code: "section4",
      title: "IV. Сведения об организации подготовки, повышения квалификации и переподготовки профсоюзных кадров и актива",
      order: 4,
      fields: [
        {
          code: "f2_s4_fulltime_workers",
          name: "fulltime_workers",
          title: "Профсоюзные освобожденные (штатные) работники",
          num: "1",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 4,
          columnHeaders: ["Всего", "Прошли подготовку", "Повышение квалификации", "Переподготовку"],
          order: 1,
        },
        {
          code: "f2_s4_fulltime_chairman",
          name: "fulltime_chairman",
          title: "председатель первичной профсоюзной организации",
          num: "1.1",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 4,
          columnHeaders: ["Всего", "Прошли подготовку", "Повышение квалификации", "Переподготовку"],
          order: 2,
        },
        {
          code: "f2_s4_fulltime_shop_chairmen",
          name: "fulltime_shop_chairmen",
          title: "председатели цеховых профсоюзных организаций, профбюро",
          num: "1.2",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 4,
          columnHeaders: ["Всего", "Прошли подготовку", "Повышение квалификации", "Переподготовку"],
          order: 3,
        },
        {
          code: "f2_s4_fulltime_specialists",
          name: "fulltime_specialists",
          title: "специалисты аппарата профкома",
          num: "1.3",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 4,
          columnHeaders: ["Всего", "Прошли подготовку", "Повышение квалификации", "Переподготовку"],
          order: 4,
        },
        {
          code: "f2_s4_voluntary_activists",
          name: "voluntary_activists",
          title: "Профсоюзный актив на общественных началах",
          num: "2",
          fieldType: "integer",
          isMultiple: true,
          columnsCount: 4,
          columnHeaders: ["Всего", "Прошли подготовку", "Повышение квалификации", "Переподготовку"],
          order: 5,
        },
        {
          code: "f2_s4_schools_count",
          name: "schools_count",
          title: "Количество школ профсоюзного актива",
          fieldType: "integer",
          order: 6,
        },
        {
          code: "f2_s4_trained_count",
          name: "trained_count",
          title: "В них обучено (чел.)",
          fieldType: "integer",
          order: 7,
        },
        {
          code: "f2_s4_training_budget_percent",
          name: "training_budget_percent",
          title: "Доля финансовых средств, израсходованных на обучение профсоюзных кадров и актива по смете расходов первичной профсоюзной организации и с учетом других источников финансирования (%)",
          fieldType: "decimal",
          order: 8,
        },
      ],
    },
  ],
};

/**
 * Создать шаблон отчёта с секциями и полями
 */
async function seedReportTemplate(templateData: typeof FORM2_TEMPLATE): Promise<void> {
  console.log(`\n📋 Creating template: ${templateData.name}...`);

  // Создаём или обновляем шаблон
  const template = await prisma.reportTemplate.upsert({
    where: { code: templateData.code },
    create: {
      code: templateData.code,
      name: templateData.name,
      description: templateData.description,
      periodicity: templateData.periodicity,
      forOrganizationTypes: templateData.forOrganizationTypes,
      isActive: true,
    },
    update: {
      name: templateData.name,
      description: templateData.description,
      periodicity: templateData.periodicity,
      forOrganizationTypes: templateData.forOrganizationTypes,
    },
  });

  console.log(`  ✅ Template created: ${template.id}`);

  // Создаём секции
  for (const sectionData of templateData.sections) {
    console.log(`  📁 Creating section: ${sectionData.title}`);

    const section = await prisma.reportTemplateSection.upsert({
      where: {
        templateId_code: {
          templateId: template.id,
          code: sectionData.code,
        },
      },
      create: {
        templateId: template.id,
        code: sectionData.code,
        title: sectionData.title,
        order: sectionData.order,
      },
      update: {
        title: sectionData.title,
        order: sectionData.order,
      },
    });

    // Создаём поля секции
    for (const fieldData of sectionData.fields) {
      await prisma.reportTemplateField.upsert({
        where: {
          sectionId_code: {
            sectionId: section.id,
            code: fieldData.code,
          },
        },
        create: {
          sectionId: section.id,
          code: fieldData.code,
          name: fieldData.name,
          title: fieldData.title,
          num: fieldData.num || null,
          description: fieldData.description || null,
          help: fieldData.help || null,
          fieldType: fieldData.fieldType,
          isRequired: fieldData.isRequired || false,
          isMultiple: fieldData.isMultiple || false,
          columnsCount: fieldData.columnsCount || 1,
          columnHeaders: fieldData.columnHeaders || null,
          autoFillFrom: fieldData.autoFillFrom || null,
          formula: fieldData.formula || null,
          order: fieldData.order,
        },
        update: {
          name: fieldData.name,
          title: fieldData.title,
          num: fieldData.num || null,
          description: fieldData.description || null,
          help: fieldData.help || null,
          fieldType: fieldData.fieldType,
          isRequired: fieldData.isRequired || false,
          isMultiple: fieldData.isMultiple || false,
          columnsCount: fieldData.columnsCount || 1,
          columnHeaders: fieldData.columnHeaders || null,
          autoFillFrom: fieldData.autoFillFrom || null,
          formula: fieldData.formula || null,
          order: fieldData.order,
        },
      });
    }

    console.log(`    ✅ ${sectionData.fields.length} fields created`);
  }

  console.log(`\n✅ Template "${templateData.name}" seeded successfully!`);
}

/**
 * Главная функция seed
 */
async function main(): Promise<void> {
  console.log("🚀 Starting to seed report templates...\n");

  // Создаём Форму 2
  await seedReportTemplate(FORM2_TEMPLATE);

  console.log("\n✅ All report templates have been seeded!");
}

// Запуск
if (require.main === module) {
  main()
    .catch((e) => {
      console.error("❌ Error seeding reports:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedReportTemplate, FORM2_TEMPLATE };
