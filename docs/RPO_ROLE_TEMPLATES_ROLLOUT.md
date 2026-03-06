# Rollout: RPO Role Templates

## Feature flag

- Flag: `RPO_ROLE_TEMPLATES_ENABLED`
- `false` (default): legacy режим, PPO может CRUD ролей
- `true`: PPO роли в `read + assign`, CRUD только через RPO API

## Новые API

- `GET/POST /api/org-head/roles`
- `GET/PATCH/DELETE /api/org-head/roles/:id`
- `POST /api/org-head/roles/:id/publish`
- `GET /api/org-head/permissions/effective?userId=...&requiredPermission=...`
- `GET/PATCH /api/org-head/members/:id` (scoped-редактирование)

## Подготовка данных

1. Запустить bootstrap шаблонов:
   - `pnpm roles:bootstrap-rpo-templates -- <rpoOrganizationId>`
2. Проверить шаблоны:
   - `GET /api/org-head/roles`
3. Опубликовать роли в ППО:
   - `POST /api/org-head/roles/:id/publish`

## Этапы включения

1. **Dry-run (flag=false)**
   - Проверить `effective permissions` для ключевых сотрудников
   - Убедиться, что шаблоны РПО сформированы и публикуются в ППО
2. **Canary**
   - Включить `RPO_ROLE_TEMPLATES_ENABLED=true` на тестовом контуре
   - Проверить назначение сотрудников в ППО на опубликованные роли
3. **Production rollout**
   - Включить flag в prod
   - Мониторить 403 ответы по `denyReason`

## Быстрый rollback

- Установить `RPO_ROLE_TEMPLATES_ENABLED=false`
- PPO endpoints мгновенно возвращаются в legacy-режим CRUD ролей

## Тестирование

1. **РПО: Роли и должности** (`/dashboard/roles`)
   - Войти как руководитель РПО. В меню: «Роли и должности», «Сотрудники», «Шаблоны документов».
   - Открыть «Роли и должности» — список шаблонов ролей, создание/редактирование/удаление, кнопка «Опубликовать».
   - При 403 (не РПО) — редирект на `/dashboard`.

2. **РПО: Сотрудники** (`/dashboard/staff`)
   - Режим РПО: колонка «Организация», в добавлении — выбор организации и роли по ней. Редактирование — роли выбранной организации. Вкладка «Роли» — ссылка на «Роли и должности».

3. **РПО: Шаблоны документов** (`/dashboard/document-templates`)
   - Только просмотр списка шаблонов (AGENDA, PROTOCOL, RESOLUTION, PROTOCOL_EXTRACT). При 403 — редирект.

4. **Флаг RPO_ROLE_TEMPLATES_ENABLED**
   - `true`: в ППО в «Сотрудники» → вкладка «Роли» только просмотр и назначение; создание ролей в ППО запрещено (403).
   - `false`: председатель ППО может создавать/редактировать роли как раньше.

5. **Миграция прав ролей** (опционально)
   - `pnpm roles:migrate-permissions -- --dry-run` — показать, какие роли будут обновлены.
   - `pnpm roles:migrate-permissions` — привести права существующих ролей к эталону из seed-staff-roles.

