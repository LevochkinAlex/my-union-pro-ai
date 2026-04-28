# Система скидок BestBenefits

> Актуально на 28.04.2026 (каталог org API: `/api/myunion/products`, см. `lib/best-benefits-catalog-url.ts`).

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
| 03:00 | Каталог скидок | `sync-discounts.ts` (через `tsx` + `dotenv -c`, см. `setup-cron.sh`) |
| 04:00 | Скидки пользователей | `sync-all-users-discounts.ts` |

Оба задания запускаются автоматически. Скидки пользователей синхронизируются **ежедневно в фоне**, даже если пользователь не заходил в приложение.

**Каталог BB:** загрузка идёт постранично (`per_page=100`). Логика остановки — по `meta.current_page` / `meta.last_page`, при отсутствии полей — по `meta.total`, затем по `links.next`, иначе по «полной порции» как у простого REST. Лимит страниц по умолчанию **500** (~50 000 позиций); при необходимости задайте **`BESTBENEFITS_CATALOG_MAX_PAGES`** (макс. 5000 в коде). Итог последнего прогона каталога: `SyncLog` (`type: DISCOUNTS`), поле **`metadata`**: `{ catalogCount, pagesFetched, truncatedByCap }`. Для админа: **`GET /api/discounts/sync-all`** — в ответе поле **`lastCatalogSync`** (последняя запись лога).

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
# 0. Проверка org-токена и пути каталога (без вывода секрета)
pnpm bb:check-org-token

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

# Полный URL списка каталога для org-токена (пагинация ?per_page=&page=). По умолчанию в коде:
#   https://bestbenefits.ru/api/myunion/products
# Раньше в .env часто было BEST_BENEFITS_API_URL=https://bestbenefits.ru/api/products — такое значение
# в рантайме автоматически заменяется на .../api/myunion/products (см. resolveBestBenefitsCatalogProductsUrl).
# Другой явный URL задавайте только если BB выдал отдельный endpoint.

# Шифрование паролей пользователей (храним пароли BB пользователей в нашей БД)
BB_PASSWORD_ENCRYPTION_KEY=your-32-char-key

# CDN для изображений
CDN_URL=https://cdn.myunion.pro

# Organization API (только MyUnion, пути /api/profsoyuzy не используются):
#   POST https://bestbenefits.ru/api/myunion/create_user
#   POST https://bestbenefits.ru/api/myunion/change_status
# BB_PROFSOYUZY_TOKEN — Bearer для этих вызовов (имя переменной историческое).
# BB_ORG_API_BASE — опционально другая база (должна быть вроде .../api/myunion). Если указан URL с profsoyuzy — код принудительно использует /api/myunion.
```

### Org-токен: `401` / «Невалидный токен» на каталоге

Каталог с org-токеном запрашивается у **`https://bestbenefits.ru/api/myunion/products`** (или значение из `BEST_BENEFITS_API_URL`, если это не legacy `/api/products`).

Это **не** пароль пользователя MyUnion, а **ключ интеграции организации**, который выдаёт поддержка / кабинет BestBenefits для проекта «МойСоюз». Срок действия или состав ключа могут меняться на стороне BB.

**Что сделать:**

1. Запросить у BestBenefits **актуальный Bearer** для API каталога и `myunion` (тот же тип, что кладёте в `BB_PROFSOYUZY_TOKEN`).
2. На VDS в `/opt/my-union-pro/.env.local` обновить строку `BB_PROFSOYUZY_TOKEN=...` (без лишних кавычек вокруг значения; при копировании из Windows следите за `\r` — код снимает BOM и нормализует пробелы, см. `lib/best-benefits-token-env.ts`).
3. Локально проверить перед заливкой: **`pnpm bb:check-org-token`** — `GET …/myunion/products?per_page=1` (**токен не печатается**).
4. Обновить прод: удобно `bash scripts/update-bb-env-on-vds.sh` (см. файл) **или** правка `.env.local` вручную + `pm2 restart my-union-pro`.
5. Прогнать каталог: на сервере `dotenv -c -- tsx scripts/sync-discounts.ts` (как в crontab) или локально `pnpm sync:discounts` с рабочим `DATABASE_URL`.

Если после замены ключа всё ещё `401`, проверьте, что **`BEST_BENEFITS_API_URL`** (если задан нестандартно) указывает на тот же контур BB, для которого выдан токен.

Тексты скидок (`description` / `short_description` / отдельные поля условий) нормализуются в `lib/best-benefits-description.ts` при синхронизации и в API `/api/discounts`, чтобы блок «Условия использования» не терялся при смене схемы ответа BB.

### Ошибка `401` / «Неверный email или пароль» при запросах от имени пользователя

Это **не** org-токен (`BB_PROFSOYUZY_TOKEN`), а **личный** вход в BB: `POST https://bestbenefits.ru/api/auth` с `email` + паролем из поля `User.bestBenefitsPassword` (расшифрованным).

Типичные причины:

1. Пользователь сменил пароль на bestbenefits.ru — в нашей БД остался старый.
2. Раньше при создании аккаунта в BB пароль **не сохраняли** в `bestBenefitsPassword` (исправлено для `/api/user/verify-email` и для `/api/admin/reset-and-sync-bb`).
3. Расхождение после миграции/ручных правок.

**Что сделать:** для затронутого пользователя выровнять пароль: суперадмин — `POST /api/admin/reset-and-sync-bb` с телом `{ "email": "..." }` (после фикса сохраняется и `bestBenefitsPassword`, и создаётся/обновляется пользователь в BB), либо скрипты в `scripts/` (`fix-bb-user-password`, `reset-and-sync-bb`).

### Массовый сброс паролей BB (все пользователи)

Скрипт `scripts/reset-all-bb-user-passwords.ts` для каждого пользователя с подтверждённым email и заполненным ФИО генерирует новый пароль, вызывает `POST .../myunion/create_user` и сохраняет `bestBenefitsPassword` в БД.

```bash
pnpm dotenv -e .env.local -- tsx scripts/reset-all-bb-user-passwords.ts --dry-run
pnpm dotenv -e .env.local -- tsx scripts/reset-all-bb-user-passwords.ts --execute
# только уже «привязанные» к BB (есть bestBenefitsUserId):
pnpm bb:reset-all-passwords -- --execute --only-with-bb-id
```

Если пользователь **уже** был в BestBenefits, API может вернуть «уже существует» — пароль на стороне BB тогда **не** меняется; email попадёт в отчёт `tmp/bb-reset-all-skipped-*.json`. Для них — `pnpm dotenv -e .env.local -- tsx scripts/fix-bb-user-password.ts EMAIL` (код из письма).

## Известные ограничения

1. **Rate Limiting BestBenefits** - API ограничивает частоту запросов. При массовых операциях нужны задержки 3+ сек.

2. **Лимит купонов на пользователя** - Некоторые скидки имеют лимит (например, Яндекс Лавка - 1 купон).

3. **Скидки без промокода** - Некоторые скидки возвращают текст вместо кода (например, "Штрихкод в купоне").

4. **Options** - Не все скидки с вариантами имеют поле `options` в API.

## Прод: актуальные строки в `.env.local`

Чтобы на VDS явно были те же ключи, что в шаблоне (не полагаться только на дефолты в коде), с машины с SSH к root:

```bash
bash scripts/ensure-vds-bb-catalog-env.sh
# или: pnpm env:ensure-vds-bb-catalog
```

Скрипт дописывает **`BEST_BENEFITS_API_URL`** и **`BESTBENEFITS_CATALOG_MAX_PAGES`**, не меняет `BB_PROFSOYUZY_TOKEN` и остальные переменные, делает бэкап `.env.local` и перезапускает PM2.

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

