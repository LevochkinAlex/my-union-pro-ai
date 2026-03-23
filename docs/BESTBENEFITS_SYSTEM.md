# Система скидок BestBenefits

> Актуальная документация на 04.03.2025

## Архитектура

### Источник истины

| Данные | Таблица | Синхронизация |
|--------|---------|---------------|
| Каталог скидок | `Discount`, `DiscountCategory` | Cron 03:00 МСК |
| Активированные скидки | `DiscountActivation` | Cron 04:00 МСК + при открытии страницы |
| Избранное | `DiscountPreference.filters.favorites` | По действию пользователя |

**Важно:** `DiscountActivation` — единственный источник для активированных скидок. `DiscountPreference.filters.claimed` обновляется при синхронизации для обратной совместимости, но API всегда читает из `DiscountActivation`.

### Локальное хранение скидок

Скидки из BestBenefits хранятся локально в PostgreSQL для:
- Быстрого поиска и фильтрации
- Независимости от API BestBenefits
- Хранения изображений на CDN (вместо base64)
- Сохранения промокодов пользователей

### Модели Prisma

```prisma
model Discount {
  id              Int      @id // ID из BestBenefits
  title           String
  description     String?  @db.Text
  shortDescription String? @db.Text
  discountValue   String?
  imageUrl        String?  @db.Text // URL на CDN
  partnerUrl      String?  @db.Text
  categories      Json?    // [{id, name, order}]
  mainCategoryId  Int?
  cities          Json?    // [{id, name}]
  tags            Json?
  options         Json?    // [{id, name}] - варианты скидки
  isPremium       Boolean  @default(false)
  validUntil      DateTime?
  isActive        Boolean  @default(true)
  lastSyncedAt    DateTime @default(now())
}

model DiscountActivation {
  id          String   @id @default(cuid())
  userId      String
  discountId  Int      // ID скидки из BestBenefits
  promoCode   String?  // Промокод (хранится локально!)
  activatedAt DateTime @default(now())
  validUntil  DateTime?
}

model DiscountFavorite {
  id         String   @id @default(cuid())
  userId     String
  discountId Int
}
```

## Синхронизация скидок

### Автоматическая (Cron)

Настройка: `bash scripts/setup-cron.sh` на VDS.

| Время (МСК) | Задача | Скрипт / API |
|-------------|--------|--------------|
| 03:00 | Каталог скидок | `sync-discounts.mjs` |
| 04:00 | Скидки пользователей | `sync-all-users-discounts.ts` |

Оба задания запускаются автоматически. Скидки пользователей синхронизируются **ежедневно в фоне**, даже если пользователь не заходил в приложение.

### Ручная

- **Админка:** `/admin/discounts` → "Синхронизировать" (каталог)
- **API каталог:** `POST /api/discounts/sync-all` или `GET /api/cron/sync-discounts?secret=CRON_SECRET`
- **API пользователи:** `GET /api/cron/sync-user-discounts?secret=CRON_SECRET`

### Логика синхронизации ("Комплиментарная")

**Сохраняются локальные данные:**
- `title` - если уже есть
- `imageUrl` - если уже загружено на CDN
- `promoCode` в активациях - никогда не перезаписывается

**Обновляются из BestBenefits:**
- `description`, `shortDescription`
- `discountValue`
- `partnerUrl`
- `categories`, `cities`, `tags`
- `options` (варианты скидки)
- `validUntil`
- `isActive`

## Активация скидок

### Endpoint
`POST /api/discounts/activate`

### Тело запроса
```json
{
  "discountId": 1930,
  "optionId": 123  // опционально, для скидок с вариантами
}
```

### BestBenefits API
```
POST https://bestbenefits.ru/api/promo
Body: { "id": discountId, "optionId": optionId }
Headers: Authorization: Bearer {user_token}
```

### Важно
- Используется **персональный токен пользователя**, не организации
- Промокод сохраняется в `DiscountActivation.promoCode`
- Некоторые скидки не возвращают код (например, "Штрихкод в купоне")

## Интеграция пользователей

### Создание аккаунта BestBenefits

Аккаунт создается **только после подтверждения email в анкете**:
1. Пользователь заполняет анкету (ФИО, email)
2. Подтверждает email через код
3. Система создает аккаунт в BestBenefits
4. Пароль шифруется и сохраняется в `User.bestBenefitsPassword`

### Шифрование пароля

Файл: `lib/best-benefits-password.ts`

```typescript
// Шифрование (AES-256-GCM)
encryptPassword(password: string): string

// Дешифрование
decryptPassword(encryptedPassword: string): string
```

Ключ: `BB_PASSWORD_ENCRYPTION_KEY` в `.env`

## UI компоненты

### Страница скидки
`app/dashboard/discounts/[id]/page.tsx`

**Функционал:**
- Отображение информации о скидке
- Кнопка "Получить" → активация
- Если есть `options` → модалка выбора варианта
- Промокод + QR-код в модалке
- Скачивание карточки как изображение
- Добавление в избранное

### Список скидок
`app/dashboard/discounts/page.tsx`

**Функционал:**
- Поиск по названию
- Фильтр по категориям (мультиселект)
- Бесконечная прокрутка

### Мои скидки
`app/dashboard/discounts/my/page.tsx`

**Функционал:**
- Активированные скидки
- Избранное
- Удаление из избранного

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/discounts/local` | Список скидок из локальной БД |
| GET | `/api/discounts?id=123` | Детали скидки (обогащенные из BB) |
| POST | `/api/discounts/activate` | Активация скидки |
| POST | `/api/discounts/sync-all` | Синхронизация всех скидок |
| GET | `/api/discounts/favorites` | Избранные скидки пользователя |
| POST | `/api/discounts/favorites` | Добавить в избранное |
| DELETE | `/api/discounts/favorites` | Удалить из избранного |

## Скрипты

### Канонические (использовать эти)

```bash
# 1. Каталог скидок
pnpm sync:discounts

# 2. Скидки всех пользователей
pnpm sync:all-users-discounts
```

### Один пользователь
```bash
pnpm tsx scripts/sync-user-discounts-direct.mjs user@example.com
```

### Устаревшие (не использовать)

- `sync:promo-codes` — обновляет только `DiscountPreference`, приложение читает из `DiscountActivation`. Используйте `sync:all-users-discounts`.

## Переменные окружения

```env
# BestBenefits: Bearer для каталога / org API (как выдаёт BB; BB_LOGIN/BB_PASSWORD не нужны)
BB_PROFSOYUZY_TOKEN=...
# опционально то же под другим именем:
# BB_API_TOKEN=...

BB_API_URL=https://bestbenefits.ru/api

# Шифрование паролей пользователей (храним пароли BB пользователей в нашей БД)
BB_PASSWORD_ENCRYPTION_KEY=your-32-char-key

# CDN для изображений
CDN_URL=https://cdn.myunion.pro

# Organization API (создание/статус пользователя в BB) — актуально:
# POST https://bestbenefits.ru/api/myunion/create_user
# POST https://bestbenefits.ru/api/myunion/change_status
# BB_PROFSOYUZY_TOKEN — Bearer для этих вызовов (имя историческое).
# BB_ORG_API_BASE — переопределить базу (по умолчанию /api/myunion).
# BB_ORG_API_USE_LEGACY_PROFSOYUZY=1 — дополнительно пробовать /api/profsoyuzy (legacy).
```

Тексты скидок (`description` / `short_description` / отдельные поля условий) нормализуются в `lib/best-benefits-description.ts` при синхронизации и в API `/api/discounts`, чтобы блок «Условия использования» не терялся при смене схемы ответа BB.

## Известные ограничения

1. **Rate Limiting BestBenefits** - API ограничивает частоту запросов. При массовых операциях нужны задержки 3+ сек.

2. **Лимит купонов на пользователя** - Некоторые скидки имеют лимит (например, Яндекс Лавка - 1 купон).

3. **Скидки без промокода** - Некоторые скидки возвращают текст вместо кода (например, "Штрихкод в купоне").

4. **Options** - Не все скидки с вариантами имеют поле `options` в API.

## Мониторинг

### Логи
```bash
tail -f /var/log/myunion/sync-discounts.log       # каталог
tail -f /var/log/myunion/sync-user-discounts.log  # пользователи
```

### Логи в БД
Таблица `SyncLog` хранит историю синхронизаций каталога.

---

*Последнее обновление: 04.03.2025*

