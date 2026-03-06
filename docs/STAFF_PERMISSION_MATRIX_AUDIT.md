# Аудит матрицы прав сотрудников (PPO API)

## Единый список permission keys

Источник истины: `lib/staff-permission-matrix.ts`

- `documents_view`
- `documents_create`
- `documents_edit`
- `documents_approve`
- `documents_sign`
- `discounts_view`
- `discounts_manage`
- `members_view`
- `members_edit`
- `members_manage`
- `appeals_view`
- `appeals_respond`
- `appeals_manage`
- `chats_view`
- `chats_participate`
- `chats_create`
- `news_view`
- `news_create`
- `news_manage`
- `reports_view`
- `reports_create`
- `settings_view`
- `settings_manage`
- `staff_view`
- `staff_manage`

## Где проверяются права в PPO API

### Документы
- `app/api/ppo-head/documents/route.ts`
  - `GET`: `documents_view`
  - `POST`: `documents_create`
- `app/api/ppo-head/documents/[id]/workflow/route.ts`
  - Действия через `ACTION_PERMISSIONS`:
    - review/approval/sign/register/send/receive/complete/archive
  - Базовая проверка входа: `documents_view`
- `app/api/ppo-head/meetings/[id]/documents/[documentId]/approve/route.ts`
  - Логика заседания + роль участника заседания

### Обращения
- `app/api/ppo-head/appeals/[id]/status/route.ts`
  - `appeals_respond`

### Отчетность
- `app/api/ppo-head/reports/[id]/route.ts`
  - `GET`: `reports_view`
  - `PATCH/DELETE`: `reports_create`
- `app/api/ppo-head/reports/[id]/status/route.ts`
  - `reports_create` (для статусов в контуре организации)

### Сотрудники и роли
- `app/api/ppo-head/staff/route.ts`
  - `GET`: `staff_view`
  - `POST`: `staff_manage`
- `app/api/ppo-head/staff/[id]/route.ts`
  - `GET`: `staff_view`
  - `PATCH/DELETE`: `staff_manage`
- `app/api/ppo-head/roles/route.ts`
  - `GET`: `staff_view`
  - `POST`: `staff_manage` (при выключенном RPO feature flag)
- `app/api/ppo-head/roles/[id]/route.ts`
  - `GET`: `staff_view`
  - `PATCH/DELETE`: `staff_manage` (при выключенном RPO feature flag)

## Диагностика отказов

`lib/staff-permissions.ts` возвращает:
- `requiredPermission`
- `denyReason` (`USER_NOT_FOUND`, `NO_ACTIVE_STAFF_POSITION`, `MISSING_PERMISSION`)
- `source` (`chairman`, `staff`, `none`)

Это используется в API-ответах 403 для быстрого дебага.

