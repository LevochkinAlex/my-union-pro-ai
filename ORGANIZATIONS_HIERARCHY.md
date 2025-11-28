# Справочник организаций с иерархией

## Структура

Система поддерживает **иерархический справочник профсоюзных организаций** с 3 уровнями:

1. **FEDERATION** (Федерация) - верхний уровень
2. **REGIONAL** (Региональная организация) - средний уровень
3. **PRIMARY** (Первичная профсоюзная организация, ППО) - нижний уровень

### Схема БД

```prisma
model Organization {
  id        String           @id @default(cuid())
  name      String
  type      OrganizationType
  
  // Иерархия
  parentId  String?
  parent    Organization?    @relation("OrganizationHierarchy", fields: [parentId], references: [id])
  children  Organization[]   @relation("OrganizationHierarchy")
  
  // Уровень в иерархии (0 = корень, 1 = первый уровень и т.д.)
  level     Int              @default(0)
  
  // Порядок сортировки
  sortOrder Int              @default(0)
  
  // Полный путь (для быстрого поиска)
  fullPath  String?          // "Федерация / Региональная / ППО"
  
  // Контакты
  inn              String? @unique
  address          String?
  phone            String?
  email            String?
  chairmanName     String?
  
  // Связи
  members          User[]
  documents        Document[]
  membershipHistory MembershipHistory[]
  
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Пример иерархии

Структура из Figma:

```
МРОСПОМП (Московская региональная организация)
├── МСЧ-122 (ППО)
├── МСЧ-123 (ППО)
├── МСЧ-125 (ППО)
└── МСЧ-126 (ППО)

Профсоюз работников здравоохранения РФ (Федерация)
├── Региональная организация Москвы
│   ├── ППО Больница №1
│   └── ППО Поликлиника №5
└── Региональная организация Санкт-Петербурга
    └── ППО Больница №10
```

## API Endpoints

### 1. GET /api/organizations

Получает список всех активных организаций.

**Ответ:**
```json
{
  "tree": [
    {
      "id": "org1",
      "name": "МРОСПОМП",
      "type": "REGIONAL",
      "parentId": null,
      "level": 0,
      "sortOrder": 1,
      "fullPath": "МРОСПОМП",
      "children": [
        {
          "id": "org2",
          "name": "МСЧ-122",
          "type": "PRIMARY",
          "parentId": "org1",
          "level": 1,
          "sortOrder": 1,
          "fullPath": "МРОСПОМП / МСЧ-122",
          "children": []
        }
      ]
    }
  ],
  "flatList": [
    {
      "id": "org1",
      "name": "МРОСПОМП",
      "type": "REGIONAL",
      "level": 0,
      "fullPath": "МРОСПОМП",
      "indentedName": "МРОСПОМП"
    },
    {
      "id": "org2",
      "name": "МСЧ-122",
      "type": "PRIMARY",
      "level": 1,
      "fullPath": "МРОСПОМП / МСЧ-122",
      "indentedName": "  МСЧ-122"
    }
  ]
}
```

### 2. POST /api/organizations (SUPER_ADMIN)

Создает новую организацию.

**Запрос:**
```json
{
  "name": "МСЧ-130",
  "type": "PRIMARY",
  "parentId": "org1",
  "inn": "7700123456",
  "address": "г. Москва, ул. Ленина, 1",
  "phone": "+7 (495) 123-45-67",
  "email": "msch130@example.com",
  "chairmanName": "Иванов И.И.",
  "sortOrder": 10
}
```

**Ответ:**
```json
{
  "success": true,
  "organization": {
    "id": "neworg1",
    "name": "МСЧ-130",
    "type": "PRIMARY",
    "parentId": "org1",
    "level": 1,
    "fullPath": "МРОСПОМП / МСЧ-130",
    ...
  }
}
```

### 3. GET /api/organizations/[id]

Получает данные конкретной организации с родителем и детьми.

### 4. PUT /api/organizations/[id] (SUPER_ADMIN)

Обновляет данные организации.

### 5. DELETE /api/organizations/[id] (SUPER_ADMIN)

Деактивирует организацию (мягкое удаление).

## UI компоненты

### Dropdown с организациями

В анкете (`ProfileSelfFillModal.tsx`):

```tsx
<select
  name="organizationId"
  value={data.organizationId}
  onChange={handleChange}
  required
>
  <option value="">Выберите организацию...</option>
  {organizations.map((org) => (
    <option key={org.id} value={org.id}>
      {org.indentedName}
    </option>
  ))}
</select>
```

**Особенности:**
- `indentedName` содержит отступы для визуальной иерархии
- `fullPath` отображается под выбранной организацией
- Обязательное поле (валидация на фронте и бэке)

### Отображение в профиле

На странице профиля (вкладка "Членство"):

```tsx
{membershipData.currentOrganization && (
  <div>
    <label>Организация</label>
    <p>{membershipData.currentOrganization.name}</p>
    {membershipData.currentOrganization.type === "text" && (
      <p className="text-orange-600">
        ⚠️ Организация не привязана к справочнику
      </p>
    )}
  </div>
)}
```

**Типы отображения:**
- `linked` - организация из справочника (показываются ИНН, председатель)
- `text` - старое текстовое поле (показывается предупреждение)
- `null` - организация не указана (показывается алерт)

## Миграция данных

### Проблема

Старые пользователи имеют `organizationName` (текстовое поле), но не имеют `organizationId` (связь со справочником).

### Решение

1. **API `/api/profile/membership` поддерживает оба варианта:**
   - Если есть `organizationId` → возвращает `type: "linked"`
   - Если только `organizationName` → возвращает `type: "text"`

2. **При обновлении профиля:**
   - `organizationName` очищается
   - `organizationId` устанавливается из выбранной организации

3. **UI показывает предупреждение** для старых пользователей с просьбой обновить профиль.

## Заполнение справочника

### Автоматическое (рекомендуется)

Используйте скрипт `scripts/seed-organizations.ts`:

```bash
pnpm tsx scripts/seed-organizations.ts
```

Скрипт:
- Создает иерархическую структуру из массива данных
- Автоматически вычисляет `level` и `fullPath`
- Поддерживает неограниченную глубину вложенности
- Выводит статистику после завершения

### Ручное (через админку)

**TODO:** Создать админ-панель для управления организациями.

Функционал:
- Создание/редактирование/удаление организаций
- Перемещение по иерархии (drag-and-drop)
- Массовый импорт из CSV/Excel
- Визуализация дерева организаций

## Права доступа

| Роль | Просмотр | Создание | Редактирование | Удаление |
|------|----------|----------|----------------|----------|
| USER | ✅ (активные) | ❌ | ❌ | ❌ |
| UNION_ADMIN | ✅ (все) | ❌ | ❌ | ❌ |
| SUPER_ADMIN | ✅ (все) | ✅ | ✅ | ✅ |

## Валидация

### На фронтенде

```typescript
if (!profileData.organizationId) {
  alert("Заполните все обязательные поля");
  return false;
}

if (!organizations.find(org => org.id === profileData.organizationId)) {
  alert("Выберите организацию из списка");
  return false;
}
```

### На бэкенде

```typescript
// При создании/обновлении организации
if (!name || !type) {
  return NextResponse.json(
    { error: "Название и тип организации обязательны" },
    { status: 400 }
  );
}

// При удалении
const membersCount = await prisma.user.count({
  where: { organizationId: params.id },
});

if (membersCount > 0) {
  return NextResponse.json(
    { error: `Невозможно удалить организацию с активными членами (${membersCount})` },
    { status: 400 }
  );
}
```

## TODO

- [ ] Заполнить полную структуру из Figma (ссылка в коде)
- [ ] Создать админ-панель для управления организациями
- [ ] Добавить поиск по организациям (fuzzy search)
- [ ] Добавить экспорт/импорт CSV
- [ ] Создать миграцию для старых пользователей с `organizationName`
- [ ] Добавить возможность массового переноса пользователей между организациями
- [ ] Интеграция с API Минюста для проверки ИНН

## Тестирование

1. Запустите миграцию Prisma:
   ```bash
   pnpm prisma migrate dev
   ```

2. Заполните тестовые данные:
   ```bash
   pnpm tsx scripts/seed-organizations.ts
   ```

3. Откройте анкету и убедитесь, что dropdown показывает организации с отступами

4. Выберите организацию и сохраните профиль

5. Откройте вкладку "Членство" в профиле и проверьте, что организация отображается

## Связанные файлы

- `prisma/schema.prisma` - схема БД
- `app/api/organizations/route.ts` - API для списка и создания
- `app/api/organizations/[id]/route.ts` - API для CRUD конкретной организации
- `app/api/profile/route.ts` - обновление `organizationId` при сохранении профиля
- `app/api/profile/membership/route.ts` - отображение текущей организации
- `components/chat/ProfileSelfFillModal.tsx` - dropdown с выбором организации
- `app/dashboard/profile/page.tsx` - отображение организации на странице профиля
- `scripts/seed-organizations.ts` - скрипт для заполнения справочника

