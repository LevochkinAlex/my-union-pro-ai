# 🎁 BestBenefits API Integration

## ✅ Реализация завершена

Интеграция с реальным API BestBenefits успешно реализована и протестирована.

## 📋 Что сделано

1. **Модуль авторизации** (`lib/best-benefits-auth.ts`)
   - Авторизация через `POST /api/auth`
   - Кеширование токена в памяти
   - Автоматическое обновление при истечении срока

2. **Обновленный модуль скидок** (`lib/best-benefits.ts`)
   - Интеграция с реальным API
   - Fallback на sample данные при ошибках
   - Поддержка всех параметров фильтрации

3. **Переменные окружения** (`.env.local`)
   ```bash
   BB_LOGIN="p-crusader@yandex.ru"
   BB_PASSWORD="123"
   USE_REAL_BB_API="true"
   BEST_BENEFITS_API_URL="https://bestbenefits.ru/api/products"
   ```

4. **Тестовый скрипт** (`scripts/test-bb-api.mjs`)
   - Проверка авторизации
   - Тестирование получения скидок
   ```bash
   pnpm exec dotenv -e .env.local -- node scripts/test-bb-api.mjs
   ```

## 🔧 Настройка

### Включить реальное API:
```bash
# В .env.local
USE_REAL_BB_API="true"
```

### Отключить (использовать sample данные):
```bash
# В .env.local
USE_REAL_BB_API="false"
# или закомментировать/удалить строку
```

## 📡 API Endpoints

### Авторизация
```http
POST https://bestbenefits.ru/api/auth
Content-Type: application/json

{
  "email": "p-crusader@yandex.ru",
  "password": "123"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJh...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### Получение скидок
```http
GET https://bestbenefits.ru/api/products?per_page=15&page=1
Authorization: Bearer {access_token}
Accept: application/json
```

**Параметры:**
- `search` - поиск по названию
- `city_id` - фильтр по городу
- `category_ids` - фильтр по категориям (через запятую)
- `premium` - только премиум скидки (1/0)
- `per_page` - количество на странице
- `page` - номер страницы

## 🧪 Тестирование

### Запустить тест подключения:
```bash
pnpm exec dotenv -e .env.local -- node scripts/test-bb-api.mjs
```

### Проверить скидки в браузере:
```
http://localhost:3004/dashboard/discounts
```

## 📊 Результаты тестирования

✅ **Авторизация:** Успешно  
✅ **Получение скидок:** Работает  
✅ **Токен:** Кешируется на 3600 секунд  
✅ **Fallback:** При ошибке используются sample данные

### Примеры полученных скидок:
1. Сеть ресторанов ТОКИО-CITY (Санкт-Петербург)
2. Сервис доставки САМОКАТ (Москва, СПб, и др.)
3. Доставка от Додо Пиццы (Казахстан)

## ⚠️ Важные замечания

1. **Размер кеша:** Данные API превышают 2MB, поэтому Next.js не может их кешировать автоматически. Это нормально.

2. **Токен:** Токен действителен 3600 секунд (1 час). Модуль автоматически обновляет его при необходимости.

3. **Fallback:** Если API недоступен, система автоматически переключается на sample данные.

## 🔍 Мониторинг

Проверить логи в консоли dev-сервера:
```
[best-benefits] Fetching from: https://bestbenefits.ru/api/products?...
[best-benefits] Fetched 15 discounts
```

## 📚 Документация API

- **BestBenefits API:** `public/best_benefits/BestBenefits API.html`
- **Profsoyuzy API:** `public/best_benefits/profsoyuzy_doc.html`

## 🚀 Статус

**Готово к продакшену** ✅

Интеграция полностью работает и протестирована.

