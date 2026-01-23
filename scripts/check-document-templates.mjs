#!/usr/bin/env node

/**
 * Скрипт для проверки шаблонов документов
 * Проверяет наличие шаблонов, правильность переменных и валидность генерации
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Список всех доступных переменных
const AVAILABLE_VARIABLES = [
  "firstName", "lastName", "middleName", "fullName", "fullNameGenitive",
  "phone", "email", "address", "jobTitle", "profession", "education",
  "organizationName", "organizationInn", "organizationChairmanName",
  "organizationChairmanJobTitle", "organizationChairmanFullName",
  "workplace", "workplaceInn", "directorName", "directorPosition",
  "dateOfBirth", "currentDate",
  "meetingDate", "meetingTime", "meetingPlace", "agendaItems",
  "votingParticipants", "presentMembers", "absentMembers",
  "secretaryName", "secretaryJobTitle", "resolutionNumber", "protocolNumber"
];

// Регулярное выражение для поиска переменных в шаблоне
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Извлекает все переменные из HTML шаблона
 */
function extractVariablesFromTemplate(htmlContent) {
  const variables = new Set();
  let match;
  
  while ((match = VARIABLE_REGEX.exec(htmlContent)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

/**
 * Проверяет, все ли переменные в шаблоне доступны
 */
function validateTemplateVariables(templateVariables, availableVariables) {
  const unknown = templateVariables.filter(v => !availableVariables.includes(v));
  const missing = availableVariables.filter(v => !templateVariables.includes(v));
  
  return {
    used: templateVariables,
    unknown,
    missing,
    isValid: unknown.length === 0
  };
}

async function main() {
  console.log("🔍 Проверка шаблонов документов...\n");

  try {
    // Получаем все шаблоны
    const templates = await prisma.documentTemplate.findMany({
      where: { isActive: true },
      orderBy: [
        { type: "asc" },
        { isDefault: "desc" },
      ],
    });

    console.log(`📋 Найдено шаблонов: ${templates.length}\n`);

    if (templates.length === 0) {
      console.log("⚠️  ВНИМАНИЕ: Шаблонов не найдено!");
      console.log("   Необходимо создать шаблоны в супер админке:");
      console.log("   /admin/document-templates\n");
      console.log("   Обязательные шаблоны:");
      console.log("   - MEMBERSHIP_APPLICATION (Заявление о вступлении)");
      console.log("   - CONTRIBUTION_APPLICATION (Заявление о взносах)\n");
      process.exit(1);
    }

    // Группируем по типам
    const templatesByType = {};
    templates.forEach(t => {
      if (!templatesByType[t.type]) {
        templatesByType[t.type] = [];
      }
      templatesByType[t.type].push(t);
    });

    // Проверяем обязательные шаблоны
    const requiredTypes = ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"];
    const missingTypes = requiredTypes.filter(type => !templatesByType[type] || templatesByType[type].length === 0);

    if (missingTypes.length > 0) {
      console.log("❌ ОТСУТСТВУЮТ ОБЯЗАТЕЛЬНЫЕ ШАБЛОНЫ:");
      missingTypes.forEach(type => {
        console.log(`   - ${type}`);
      });
      console.log("\n   Создайте их в супер админке: /admin/document-templates\n");
    }

    // Проверяем шаблоны по умолчанию
    const defaultTemplates = templates.filter(t => t.isDefault);
    const defaultByType = {};
    defaultTemplates.forEach(t => {
      defaultByType[t.type] = t;
    });

    console.log("📊 Статус шаблонов по умолчанию:");
    requiredTypes.forEach(type => {
      if (defaultByType[type]) {
        console.log(`   ✅ ${type}: "${defaultByType[type].name}"`);
      } else {
        console.log(`   ❌ ${type}: НЕТ ШАБЛОНА ПО УМОЛЧАНИЮ`);
      }
    });
    console.log();

    // Проверяем каждый шаблон
    console.log("🔎 Детальная проверка шаблонов:\n");
    
    let hasErrors = false;
    const report = [];

    for (const template of templates) {
      const templateVars = extractVariablesFromTemplate(template.htmlContent);
      const validation = validateTemplateVariables(templateVars, AVAILABLE_VARIABLES);
      
      const status = validation.isValid ? "✅" : "❌";
      const defaultMark = template.isDefault ? " [ПО УМОЛЧАНИЮ]" : "";
      
      console.log(`${status} ${template.name} (${template.type})${defaultMark}`);
      console.log(`   ID: ${template.id}`);
      console.log(`   Переменных в шаблоне: ${templateVars.length}`);
      
      if (templateVars.length > 0) {
        console.log(`   Используемые переменные: ${templateVars.join(", ")}`);
      }
      
      if (validation.unknown.length > 0) {
        console.log(`   ⚠️  НЕИЗВЕСТНЫЕ ПЕРЕМЕННЫЕ: ${validation.unknown.join(", ")}`);
        hasErrors = true;
      }
      
      if (!template.htmlContent || template.htmlContent.trim().length === 0) {
        console.log(`   ⚠️  ШАБЛОН ПУСТОЙ!`);
        hasErrors = true;
      }
      
      console.log();

      report.push({
        id: template.id,
        name: template.name,
        type: template.type,
        isDefault: template.isDefault,
        isActive: template.isActive,
        variablesCount: templateVars.length,
        variables: templateVars,
        unknownVariables: validation.unknown,
        hasErrors: validation.unknown.length > 0 || !template.htmlContent || template.htmlContent.trim().length === 0,
      });
    }

    // Тестовая генерация (если есть тестовый пользователь)
    console.log("🧪 Тестовая генерация документов...\n");
    
    const testUser = await prisma.user.findFirst({
      where: {
        firstName: { not: null },
        lastName: { not: null },
        dateOfBirth: { not: null },
        organization: { isNot: null },
      },
      include: { organization: true },
    });

    if (testUser) {
      console.log(`   Тестовый пользователь: ${testUser.firstName} ${testUser.lastName}`);
      
      const membershipTemplate = defaultByType["MEMBERSHIP_APPLICATION"];
      const contributionTemplate = defaultByType["CONTRIBUTION_APPLICATION"];

      if (membershipTemplate) {
        const templateVars = extractVariablesFromTemplate(membershipTemplate.htmlContent);
        console.log(`   📄 MEMBERSHIP_APPLICATION: "${membershipTemplate.name}"`);
        console.log(`      Переменных: ${templateVars.length}`);
        if (templateVars.length > 0) {
          console.log(`      Использует: ${templateVars.slice(0, 5).join(", ")}${templateVars.length > 5 ? "..." : ""}`);
        }
      }

      if (contributionTemplate) {
        const templateVars = extractVariablesFromTemplate(contributionTemplate.htmlContent);
        console.log(`   📄 CONTRIBUTION_APPLICATION: "${contributionTemplate.name}"`);
        console.log(`      Переменных: ${templateVars.length}`);
        if (templateVars.length > 0) {
          console.log(`      Использует: ${templateVars.slice(0, 5).join(", ")}${templateVars.length > 5 ? "..." : ""}`);
        }
      }
    } else {
      console.log("   ⚠️  Тестовый пользователь не найден для проверки генерации");
    }

    console.log("\n" + "=".repeat(60));
    console.log("📋 ИТОГОВЫЙ ОТЧЕТ");
    console.log("=".repeat(60));
    console.log(`Всего шаблонов: ${templates.length}`);
    console.log(`Шаблонов по умолчанию: ${defaultTemplates.length}`);
    console.log(`Шаблонов с ошибками: ${report.filter(r => r.hasErrors).length}`);
    console.log(`Обязательных шаблонов отсутствует: ${missingTypes.length}`);
    
    if (hasErrors || missingTypes.length > 0) {
      console.log("\n❌ ОБНАРУЖЕНЫ ПРОБЛЕМЫ!");
      console.log("\nРекомендации:");
      if (missingTypes.length > 0) {
        console.log("1. Создайте отсутствующие обязательные шаблоны");
      }
      if (report.some(r => r.unknownVariables.length > 0)) {
        console.log("2. Исправьте неизвестные переменные в шаблонах");
      }
      console.log("3. Проверьте шаблоны в супер админке: /admin/document-templates");
      process.exit(1);
    } else {
      console.log("\n✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!");
      process.exit(0);
    }

  } catch (error) {
    console.error("❌ Ошибка при проверке:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
