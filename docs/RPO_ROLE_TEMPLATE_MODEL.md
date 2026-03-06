# RPO Role Template Model (Phase 1)

## Текущая реализация (в коде)

Чтобы не ломать production-схему и не требовать немедленной миграции БД, шаблоны РПО в первой волне реализованы на текущей таблице `StaffRole`:

- шаблоны РПО = активные `StaffRole` в `organizationId` региональной организации;
- публикация в ППО = upsert ролей по `organizationId + name` в дочерние ППО;
- назначение сотрудников остается на `OrganizationStaff.roleId`.

Это дает совместимость с текущим UI ППО и существующими назначениями.

## One-off миграция и сопоставление

Добавлен скрипт:

- `scripts/bootstrap-rpo-role-templates.ts`

Что делает:

1. Берет активные роли дочерних ППО;
2. Дедуплицирует по `permission-hash` (SHA-256 нормализованного JSON прав);
3. Создает/обновляет шаблоны в организации РПО;
4. Возвращает JSON mapping `permissionHash -> templateRoleId -> sourceRoleIds`.

## Целевая Prisma-модель (следующая волна)

Во второй волне можно перейти на выделенную модель:

```prisma
model RpoRoleTemplate {
  id                String   @id @default(cuid())
  rpoOrganizationId String
  name              String
  description       String?
  permissions       Json
  version           Int      @default(1)
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

и явный mapping:

```prisma
model StaffRoleTemplateBinding {
  id             String @id @default(cuid())
  staffRoleId    String @unique
  templateId     String
  syncedAt       DateTime @default(now())
}
```

Но это вынесено за пределы первой волны, чтобы внедрение было без регрессий.

