# Система скидок BestBenefits

> Актуальная документация на 21.12.2024

## Архитектура

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

Скрипт `/opt/my-union-pro/scripts/sync-discounts.mjs` запускается ежедневно в 3:00.

```bash
# Crontab на VDS
0 3 * * * cd /opt/my-union-pro && /usr/bin/node scripts/sync-discounts.mjs >> /var/log/myunion/sync-discounts.log 2>&1
```

### Ручная (через админку)

Админ-панель: `/admin/discounts` → кнопка "Синхронизировать"

API endpoint: `POST /api/discounts/sync-all`

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

### Синхронизация скидок
```bash
# На VDS
cd /opt/my-union-pro
node scripts/sync-discounts.mjs
```

### Ручная регенерация промокодов
```bash
# На VDS - для конкретного пользователя
node -e "
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
// ... (см. примеры в истории)
"
```

## Переменные окружения

```env
# BestBenefits API
BB_LOGIN=email@example.com
BB_PASSWORD=password
BB_API_URL=https://bestbenefits.ru/api

# Шифрование паролей пользователей
BB_PASSWORD_ENCRYPTION_KEY=your-32-char-key

# CDN для изображений
CDN_URL=https://cdn.myunion.pro
```

## Известные ограничения

1. **Rate Limiting BestBenefits** - API ограничивает частоту запросов. При массовых операциях нужны задержки 3+ сек.

2. **Лимит купонов на пользователя** - Некоторые скидки имеют лимит (например, Яндекс Лавка - 1 купон).

3. **Скидки без промокода** - Некоторые скидки возвращают текст вместо кода (например, "Штрихкод в купоне").

4. **Options** - Не все скидки с вариантами имеют поле `options` в API.

## Мониторинг

### Логи синхронизации
```bash
# На VDS
tail -f /var/log/myunion/sync-discounts.log
```

### Логи в БД
Таблица `SyncLog` хранит историю синхронизаций.

---

*Последнее обновление: 21.12.2024*

