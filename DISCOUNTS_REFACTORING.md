# Рефакторинг системы скидок

## 🎯 Цели рефакторинга

1. **Сохранение промокодов в нашей БД** - даже если BestBenefits очистит базу, промокоды останутся у нас
2. **Проверка срока действия скидок** - автоматическое удаление устаревших скидок
3. **Улучшенная синхронизация** - более надежная синхронизация с BestBenefits

## 📊 Новая структура данных

### Таблица DiscountActivation

```sql
CREATE TABLE "DiscountActivation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountId" INTEGER NOT NULL,
    "promoCode" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "syncedFromBB" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountActivation_pkey" PRIMARY KEY ("id")
);
```

**Ключевые поля:**
- `promoCode` - промокод (сохраняется локально, даже если BestBenefits очистит базу)
- `validUntil` - срок действия скидки (из BestBenefits API)
- `syncedFromBB` - флаг синхронизации из BestBenefits
- `lastSyncedAt` - дата последней синхронизации

**Индексы:**
- `userId` - для быстрого поиска скидок пользователя
- `discountId` - для быстрого поиска по ID скидки
- `validUntil` - для быстрой очистки устаревших скидок
- Уникальный индекс `(userId, discountId)` - один пользователь может активировать скидку только один раз

## 🔄 Миграция данных

### Автоматическая миграция

Запустите скрипт для миграции существующих данных из `DiscountPreference.filters.claimed` в `DiscountActivation`:

```bash
pnpm tsx scripts/migrate-discount-activations.mjs
```

Скрипт:
- Находит всех пользователей с активированными скидками
- Получает информацию о скидках из BestBenefits API для `validUntil`
- Сохраняет промокоды в `DiscountActivation`
- Сохраняет обратную совместимость с `DiscountPreference`

## 🔧 Обновленные API endpoints

### 1. `/api/discounts/sync` (POST)

**Обновления:**
- Использует `DiscountActivation` как основной источник данных
- Сохраняет промокоды в нашу БД
- Проверяет срок действия скидок (`validUntil`)
- Автоматически удаляет устаревшие скидки
- Обновляет `DiscountPreference` для обратной совместимости

**Ответ:**
```json
{
  "success": true,
  "message": "Синхронизировано 5 скидок, удалено 2 устаревших",
  "synced": 5,
  "expired": 2,
  "total": 3
}
```

### 2. `/api/discounts/activate` (POST)

**Обновления:**
- Сохраняет активацию в `DiscountActivation`
- Получает `validUntil` из BestBenefits API
- Сохраняет промокод локально
- Обновляет `DiscountPreference` для обратной совместимости

**Ответ:**
```json
{
  "success": true,
  "discountId": 1234,
  "bestBenefitsActivated": true,
  "promoCode": "PROMO123",
  "validUntil": "2025-12-31T23:59:59Z"
}
```

### 3. `/api/discounts/preferences` (GET)

**Обновления:**
- Использует `DiscountActivation` как основной источник для `claimed`
- Формирует `filters.claimed` из `DiscountActivation`
- Сохраняет обратную совместимость с существующими компонентами

### 4. `/api/discounts` (GET)

**Обновления:**
- Использует `DiscountActivation` для определения активированных скидок
- Обогащает скидки промокодами из `DiscountActivation`
- Проверяет срок действия перед показом промокода

### 5. `/api/admin/sync-user-discounts` (POST)

**Обновления:**
- Использует новую систему синхронизации
- Сохраняет промокоды в `DiscountActivation`
- Обновляет сроки действия скидок

### 6. `/api/admin/cleanup-expired-discounts` (POST)

**Новый endpoint:**
- Удаляет все устаревшие скидки (`validUntil < now`)
- Доступен только для SUPER_ADMIN или внутренних запросов
- Можно вызывать по расписанию (cron)

## 🧹 Автоматическая очистка устаревших скидок

### Скрипт очистки

```bash
pnpm tsx scripts/cleanup-expired-discounts.mjs
```

### Настройка cron (рекомендуется)

Добавьте в crontab для ежедневной очистки в 2:00 ночи:

```bash
0 2 * * * cd /opt/my-union-pro && pnpm tsx scripts/cleanup-expired-discounts.mjs >> /var/log/discount-cleanup.log 2>&1
```

### Или через API endpoint

```bash
curl -X POST http://localhost:3000/api/admin/cleanup-expired-discounts \
  -H "X-Internal-Secret: your-secret-key"
```

## 📚 Библиотека функций

### `lib/discount-activation.ts`

**Основные функции:**

1. **`getUserActivatedDiscountsFromDB(userId)`**
   - Получает все активированные скидки пользователя из БД

2. **`saveDiscountActivation(userId, data)`**
   - Сохраняет или обновляет активированную скидку
   - Валидирует промокод перед сохранением

3. **`syncDiscountsWithBestBenefits(userId, bestBenefitsUserId, password)`**
   - Синхронизирует скидки с BestBenefits
   - Сохраняет промокоды в нашу БД
   - Возвращает статистику синхронизации

4. **`updateDiscountValidity(userId, discountId, validUntil)`**
   - Обновляет срок действия скидки
   - Автоматически удаляет, если срок истек

5. **`cleanupExpiredDiscounts()`**
   - Удаляет все устаревшие скидки для всех пользователей
   - Возвращает количество удаленных записей

6. **`getValidActivatedDiscounts(userId)`**
   - Получает только валидные (не устаревшие) скидки пользователя

7. **`isDiscountActivated(userId, discountId)`**
   - Проверяет, активирована ли скидка пользователем

8. **`getDiscountPromoCode(userId, discountId)`**
   - Получает промокод для активированной скидки

## 🔄 Обратная совместимость

Система сохраняет обратную совместимость с существующими компонентами:

1. **DiscountPreference.filters.claimed** - продолжает обновляться для совместимости
2. **API endpoints** - возвращают данные в том же формате
3. **Компоненты фронтенда** - не требуют изменений

## 📋 Чеклист развертывания

- [ ] Запустить миграцию Prisma: `pnpm prisma migrate dev`
- [ ] Запустить скрипт миграции данных: `pnpm tsx scripts/migrate-discount-activations.mjs`
- [ ] Настроить cron для автоматической очистки (опционально)
- [ ] Протестировать синхронизацию скидок
- [ ] Проверить сохранение промокодов
- [ ] Проверить удаление устаревших скидок

## 🐛 Отладка

### Проверка данных

```sql
-- Проверить активированные скидки пользователя
SELECT * FROM "DiscountActivation" WHERE "userId" = 'user-id';

-- Проверить устаревшие скидки
SELECT * FROM "DiscountActivation" WHERE "validUntil" < NOW();

-- Проверить промокоды
SELECT "discountId", "promoCode" FROM "DiscountActivation" WHERE "userId" = 'user-id' AND "promoCode" IS NOT NULL;
```

### Логирование

Все операции логируются с префиксами:
- `[sync-discounts]` - синхронизация скидок
- `[activate-discount]` - активация скидки
- `[discount-activation]` - операции с DiscountActivation

## 🎯 Преимущества новой системы

1. **Надежность** - промокоды сохраняются локально, даже если BestBenefits очистит базу
2. **Автоматизация** - устаревшие скидки удаляются автоматически
3. **Производительность** - индексы для быстрого поиска
4. **Масштабируемость** - отдельная таблица для активаций
5. **Отслеживание** - метаданные о синхронизации и сроках действия

