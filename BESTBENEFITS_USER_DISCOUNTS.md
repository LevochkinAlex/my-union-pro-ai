# BestBenefits - Учет активированных скидок пользователей

## 🎯 Вопрос
Ведет ли BestBenefits API учет активированных скидок для каждого пользователя?

## ✅ Ответ: ДА

### API Endpoint для получения активированных скидок
```
GET /api/user/products?user_id={bestBenefitsUserId}
Authorization: Bearer {token}
```

### Ответ API:
```json
{
  "products": [
    {
      "id": 1161,
      "product_id": 1161,
      "promo_code": "ABC123",
      "activated_at": "2025-11-21T10:00:00Z",
      "status": "active"
    },
    {
      "id": 1162,
      "product_id": 1162,
      "promo_code": "XYZ789",
      "activated_at": "2025-11-20T15:30:00Z",
      "status": "active"
    }
  ]
}
```

## 📋 Как это работает в нашем приложении

### 1. Активация скидки пользователем
**Два пути активации:**

#### A) Через наше приложение:
1. Пользователь нажимает "Использовать" на скидке
2. Вызывается `POST /api/discounts/activate`
3. Если `bestBenefitsUserId` установлен:
   - Вызывается BestBenefits API для активации
   - Сохраняется локально в preferences
4. Скидка помечается как "Получено"

#### B) Напрямую на сайте BestBenefits:
1. Пользователь открывает bestbenefits.ru
2. Активирует скидку там
3. BestBenefits сохраняет активацию в своей БД

### 2. Синхронизация активированных скидок
**Автоматически при загрузке страницы:**

```typescript
// components/dashboard/discounts/DiscountsClient.tsx
useEffect(() => {
  const syncWithBestBenefits = async () => {
    // 1. Вызов нашего API
    const response = await fetch("/api/discounts/sync", { method: "POST" });
    
    // 2. Наш API вызывает BestBenefits API
    // GET /api/user/products?user_id={email}
    
    // 3. Получаем список активированных скидок
    // 4. Мерджим с локальными preferences
    // 5. Обновляем UI
  };
  
  syncWithBestBenefits();
}, []);
```

### 3. Отображение на странице "Мои скидки"
**Только активированные скидки:**

```typescript
// app/dashboard/discounts/my/page.tsx
// Вкладка "Полученные" показывает только claimed
const claimedData = filters.claimed || [];
const claimedIds = claimedData.map(item => 
  typeof item === 'object' ? item.id : item
);

// Fetch discounts by IDs
const response = await fetch(`/api/discounts?ids=${claimedIds.join(",")}`);
```

## 🔄 Поток данных

### Сценарий 1: Пользователь активирует через наше приложение
```
1. User clicks "Использовать" 
   ↓
2. POST /api/discounts/activate
   ↓
3. activateBestBenefitsDiscount(params)
   ↓
4. POST /api/user/activate_product (BestBenefits API)
   ↓
5. BestBenefits сохраняет активацию
   ↓
6. Наше приложение сохраняет в preferences.claimed
   ↓
7. Кнопка меняется на "Открыть"
```

### Сценарий 2: Пользователь активирует на сайте BestBenefits
```
1. User goes to bestbenefits.ru
   ↓
2. Активирует скидку там
   ↓
3. BestBenefits сохраняет в своей БД
   ↓
4. User opens our app
   ↓
5. syncWithBestBenefits() at page load
   ↓
6. GET /api/user/products (BestBenefits API)
   ↓
7. Получаем список активированных скидок
   ↓
8. Мерджим с preferences.claimed
   ↓
9. UI обновляется - скидка помечена "Получено"
```

## 💾 Формат хранения

### В нашей БД (DiscountPreference):
```json
{
  "userId": "user123",
  "filters": {
    "claimed": [
      { "id": 1161, "promoCode": "ABC123" },  // Из BestBenefits
      { "id": 1162, "promoCode": null },      // Локальная
      { "id": 1163, "promoCode": "XYZ789" }   // Из BestBenefits
    ],
    "favorites": [1164, 1165]
  }
}
```

### В BestBenefits БД:
- Связь user_id ↔ product_id
- Дата активации
- Промокод (если есть)
- Статус (active/expired)

## 🔐 Идентификация пользователя

### В нашем приложении:
```typescript
// User.bestBenefitsUserId = email пользователя
bestBenefitsUserId: "ceo@yappix.ru"
```

### В BestBenefits API:
```typescript
// API принимает email как идентификатор
GET /api/user/products?user_id=ceo@yappix.ru
```

## 📊 Кнопки и состояния

### На странице "Все скидки":
| Состояние | Кнопка | Цвет | Действие |
|-----------|--------|------|----------|
| Не активирована | "Использовать" | Синий | Активирует + открывает модалку |
| Активирована | "Использовать" | Зеленый | Открывает модалку |

### На странице "Мои скидки":
| Вкладка | Показывает | Кнопка |
|---------|-----------|---------|
| Полученные | Только claimed | "Открыть" |
| Избранное | Только favorites | "Смотреть" |

### На детальной странице:
| Состояние | Кнопка | Действие |
|-----------|--------|----------|
| Не активирована | "Использовать" | Активирует + открывает модалку |
| Активирована | "Открыть" | Открывает модалку с промокодом |

## ✅ Что гарантируется

### BestBenefits API гарантирует:
1. ✅ Хранение активированных скидок для каждого пользователя
2. ✅ Endpoint для получения списка активаций
3. ✅ Уникальность активации (user_id + product_id)
4. ✅ Промокоды для активированных скидок

### Наше приложение гарантирует:
1. ✅ Автоматическую синхронизацию при загрузке
2. ✅ Мерджинг локальных и удаленных активаций
3. ✅ Правильное отображение кнопок
4. ✅ Только claimed на странице "Мои скидки"

## 🔍 Проверка работы

### Тест 1: Активация через наше приложение
```bash
# 1. Открыть скидку
http://localhost:3004/dashboard/discounts/1161

# 2. Нажать "Использовать"
# Ожидается:
- Кнопка меняется на "Открыть" (зеленая)
- Скидка появляется в "Мои скидки" → "Полученные"
- В BestBenefits API сохраняется активация
```

### Тест 2: Активация на BestBenefits
```bash
# 1. Перейти на bestbenefits.ru
# 2. Войти под ceo@yappix.ru
# 3. Активировать скидку
# 4. Открыть наше приложение

# Ожидается:
- В консоли лог: [DiscountsClient] Synced with BestBenefits
- Скидка помечена как "Получено"
- Скидка в "Мои скидки" → "Полученные"
```

### Тест 3: Проверка данных
```bash
# API запрос для проверки:
curl -X POST http://localhost:3004/api/discounts/sync \
  -H "Cookie: next-auth.session-token=..." \
  -H "Content-Type: application/json"

# Ожидаемый ответ:
{
  "success": true,
  "message": "Синхронизировано 3 скидок с BestBenefits",
  "synced": [1161, 1162, 1163],
  "totalClaimed": 5
}
```

## 📝 Выводы

### ✅ BestBenefits ведет учет скидок
- Каждая активация сохраняется в БД
- Связь user_id ↔ product_id ↔ promo_code
- API для получения списка активаций

### ✅ Наше приложение синхронизируется
- Автоматически при загрузке
- Мерджит с локальными данными
- Не теряет локальные активации

### ✅ UI корректно отображает состояния
- "Использовать" для неактивированных
- "Открыть" для активированных
- Только claimed в "Мои скидки" → "Полученные"

