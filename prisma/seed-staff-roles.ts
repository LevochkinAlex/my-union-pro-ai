/**
 * Скрипт для создания предустановленных ролей сотрудников
 * Запуск: npx ts-node prisma/seed-staff-roles.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Типы прав доступа
export interface StaffPermissions {
  // Документы
  documents_view: boolean; // Просмотр документов
  documents_create: boolean; // Создание документов
  documents_edit: boolean; // Редактирование документов

  // Скидки
  discounts_view: boolean; // Просмотр скидок
  discounts_manage: boolean; // Управление скидками (активация и т.д.)

  // Члены профсоюза
  members_view: boolean; // Просмотр карточек членов
  members_edit: boolean; // Редактирование карточек (награды, обучение)
  members_manage: boolean; // Управление членами (принятие, исключение)

  // Обращения
  appeals_view: boolean; // Просмотр обращений
  appeals_respond: boolean; // Ответы на обращения
  appeals_manage: boolean; // Полное управление обращениями

  // Чаты
  chats_view: boolean; // Просмотр чатов
  chats_participate: boolean; // Участие в чатах
  chats_create: boolean; // Создание групповых чатов

  // Новости
  news_view: boolean; // Просмотр новостей
  news_create: boolean; // Создание новостей
  news_manage: boolean; // Управление всеми новостями

  // Отчеты
  reports_view: boolean; // Просмотр отчетов
  reports_create: boolean; // Создание отчетов

  // Настройки организации
  settings_view: boolean; // Просмотр настроек
  settings_manage: boolean; // Управление настройками

  // Сотрудники (только для Председателя, не для ролей)
  staff_view: boolean; // Просмотр сотрудников
  staff_manage: boolean; // Управление сотрудниками и ролями
}

// Предустановленные роли
const DEFAULT_ROLES: Array<{
  name: string;
  description: string;
  permissions: StaffPermissions;
}> = [
  {
    name: "Заместитель председателя",
    description:
      "Полный доступ ко всем функциям кроме управления сотрудниками и ролями",
    permissions: {
      documents_view: true,
      documents_create: true,
      documents_edit: true,
      discounts_view: true,
      discounts_manage: true,
      members_view: true,
      members_edit: true,
      members_manage: false, // Не может принимать/исключать членов
      appeals_view: true,
      appeals_respond: true,
      appeals_manage: true,
      chats_view: true,
      chats_participate: true,
      chats_create: true,
      news_view: true,
      news_create: true,
      news_manage: true,
      reports_view: true,
      reports_create: true,
      settings_view: true,
      settings_manage: false,
      staff_view: true,
      staff_manage: false,
    },
  },
  {
    name: "Бухгалтер",
    description: "Доступ к документам, отчетам и просмотру членов профсоюза",
    permissions: {
      documents_view: true,
      documents_create: true,
      documents_edit: true,
      discounts_view: false,
      discounts_manage: false,
      members_view: true,
      members_edit: false,
      members_manage: false,
      appeals_view: false,
      appeals_respond: false,
      appeals_manage: false,
      chats_view: true,
      chats_participate: true,
      chats_create: false,
      news_view: true,
      news_create: false,
      news_manage: false,
      reports_view: true,
      reports_create: true,
      settings_view: false,
      settings_manage: false,
      staff_view: false,
      staff_manage: false,
    },
  },
  {
    name: "Секретарь",
    description: "Работа с документами, обращениями и новостями",
    permissions: {
      documents_view: true,
      documents_create: true,
      documents_edit: true,
      discounts_view: true,
      discounts_manage: false,
      members_view: true,
      members_edit: false,
      members_manage: false,
      appeals_view: true,
      appeals_respond: true,
      appeals_manage: false,
      chats_view: true,
      chats_participate: true,
      chats_create: false,
      news_view: true,
      news_create: true,
      news_manage: false,
      reports_view: true,
      reports_create: false,
      settings_view: false,
      settings_manage: false,
      staff_view: true,
      staff_manage: false,
    },
  },
  {
    name: "Специалист по работе с членами",
    description:
      "Доступ к карточкам членов профсоюза, скидкам и обращениям",
    permissions: {
      documents_view: true,
      documents_create: false,
      documents_edit: false,
      discounts_view: true,
      discounts_manage: true,
      members_view: true,
      members_edit: true, // Может вносить награды, обучение
      members_manage: false,
      appeals_view: true,
      appeals_respond: true,
      appeals_manage: false,
      chats_view: true,
      chats_participate: true,
      chats_create: false,
      news_view: true,
      news_create: false,
      news_manage: false,
      reports_view: false,
      reports_create: false,
      settings_view: false,
      settings_manage: false,
      staff_view: false,
      staff_manage: false,
    },
  },
  {
    name: "Специалист по информационной работе",
    description: "Работа с новостями и чатами",
    permissions: {
      documents_view: true,
      documents_create: false,
      documents_edit: false,
      discounts_view: true,
      discounts_manage: false,
      members_view: true,
      members_edit: false,
      members_manage: false,
      appeals_view: false,
      appeals_respond: false,
      appeals_manage: false,
      chats_view: true,
      chats_participate: true,
      chats_create: true,
      news_view: true,
      news_create: true,
      news_manage: true,
      reports_view: false,
      reports_create: false,
      settings_view: false,
      settings_manage: false,
      staff_view: false,
      staff_manage: false,
    },
  },
];

/**
 * Создать предустановленные роли для организации
 */
export async function createDefaultRolesForOrganization(
  organizationId: string
): Promise<void> {
  console.log(`Creating default roles for organization ${organizationId}...`);

  for (const roleData of DEFAULT_ROLES) {
    try {
      await prisma.staffRole.upsert({
        where: {
          organizationId_name: {
            organizationId,
            name: roleData.name,
          },
        },
        create: {
          organizationId,
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions as any,
          isSystem: true,
          isActive: true,
        },
        update: {
          description: roleData.description,
          // Не обновляем permissions для существующих ролей - председатель мог их настроить
        },
      });
      console.log(`  ✅ Created/updated role: ${roleData.name}`);
    } catch (error) {
      console.error(`  ❌ Failed to create role ${roleData.name}:`, error);
    }
  }

  console.log(`✅ Default roles created for organization ${organizationId}`);
}

/**
 * Создать предустановленные роли для всех организаций
 */
async function seedAllOrganizations(): Promise<void> {
  console.log("🚀 Starting to seed default staff roles...\n");

  // Получаем все активные организации
  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true },
  });

  console.log(`Found ${organizations.length} organizations\n`);

  for (const org of organizations) {
    console.log(`\n📁 Organization: ${org.name} (${org.type})`);
    await createDefaultRolesForOrganization(org.id);
  }

  console.log("\n✅ All default roles have been seeded!");
}

// Запуск если это main модуль
if (require.main === module) {
  seedAllOrganizations()
    .catch((e) => {
      console.error("❌ Error seeding roles:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { DEFAULT_ROLES };
