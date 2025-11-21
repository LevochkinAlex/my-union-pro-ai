# 🎁 Активация скидок BestBenefits

## ✅ Реализовано

### 1. Модуль активации (`lib/best-benefits-activation.ts`)
- `activateBestBenefitsDiscount()` - активация через API BestBenefits
- `checkDiscountActivation()` - проверка статуса активации
- `safeActivateDiscount()` - безопасная активация с fallback

### 2. API endpoint (`/api/discounts/activate`)
- Активирует скидку в BestBenefits (если пользователь синхронизирован)
- Сохраняет в локальные предпочтения
- Возвращает статус активации

### 3. UI интеграция
- Кнопка "Получить скидку" → активирует через API
- Показывает статус "Полученные"
- Открывает сайт партнера для использования

## 🔄 Как работает активация

### Шаг 1: Пользователь кликает "Получить скидку"
```javascript
handleClaim(discountId) → 
  POST /api/discounts/activate {
    discountId: 123,
    claimed: [123],
    favorites: []
  }
```

### Шаг 2: Backend обработка
```
1. Проверка авторизации
2. Получение данных пользователя
3. Если есть bestBenefitsUserId:
   → Активация через BestBenefits API
4. Сохранение в локальные предпочтения
5. Возврат результата
```

### Шаг 3: UI обновление
```
- Скидка помечается как "Полученная" ✅
- Кнопка меняется: "Получить" → "Открыть"
- Открывается сайт партнера
```

## 🎯 Два режима работы

### Режим 1: Пользователь синхронизирован с BestBenefits
```
User.bestBenefitsUserId = "bb_12345"

Активация:
1. ✅ Отправка в BestBenefits API
2. ✅ Сохранение локально
3. ✅ Скидка активна на обеих платформах
```

### Режим 2: Пользователь еще не синхронизирован
```
User.bestBenefitsUserId = null

Активация:
1. ⏭️  Пропуск BestBenefits API (будет активировано при синхронизации)
2. ✅ Сохранение локально
3. ✅ Скидка доступна через partnerUrl
```

## ⚠️ Важные заметки

### API Endpoint - гипотетический
Endpoint `/api/user/activate_product` **может не существовать** в текущем BestBenefits API.

**Нужно проверить документацию:**
- Возможные endpoint'ы:
  - `/api/user/activate_product`
  - `/api/profsoyuzy/user_products`
  - `/api/products/{id}/claim`
  - `/api/user/claimed_products`

**Если endpoint не существует:**
- Активация работает только локально
- Пользователь получает доступ через `partnerUrl`
- Промокод отображается напрямую (если есть)

### Fallback стратегия
Система работает **в любом случае**:
1. ✅ Локальное отслеживание полученных скидок
2. ✅ Переход на сайт партнера
3. ✅ Показ промокода (если есть)
4. ✅ Синхронизация с BestBenefits при наличии endpoint

## 🧪 Тестирование

### Тест 1: Активация для синхронизированного пользователя
```javascript
// User с bestBenefitsUserId
POST /api/discounts/activate
{
  discountId: 1120 // ТОКИО-CITY
}

Ожидается:
- status: 200
- bestBenefitsActivated: true (или false если endpoint не найден)
- Локальное сохранение: claimed: [1120]
```

### Тест 2: Активация для нового пользователя
```javascript
// User без bestBenefitsUserId (только зарегистрировался)
POST /api/discounts/activate
{
  discountId: 1436 // САМОКАТ
}

Ожидается:
- status: 200
- bestBenefitsActivated: false (не синхронизирован)
- Локальное сохранение: claimed: [1436]
- При синхронизации → автоматическая активация
```

### Тест 3: Проверка UI
1. Открыть `/dashboard/discounts`
2. Кликнуть "Получить скидку" на любой карточке
3. Проверить:
   - Кнопка изменилась на "Открыть"
   - Бейдж "✓ Получено"
   - Открылась вкладка с сайтом партнера
   - Вкладка "Полученные" показывает скидку

## 📊 Статистика активаций

Сохраняется в:
```prisma
DiscountPreference {
  userId: String
  filters: Json {
    claimed: [1120, 1436, ...] // ID активированных скидок
    favorites: [...]
  }
}
```

## 🔧 Настройка BestBenefits API endpoint

Когда получите правильный endpoint от BestBenefits:

1. Обновите `lib/best-benefits-activation.ts`:
```typescript
// Замените гипотетический endpoint
const response = await fetch(`${ACTIVATION_API_BASE}/correct/endpoint`, {
  method: "POST",
  body: JSON.stringify({
    // Правильная структура payload
  }),
});
```

2. Протестируйте:
```bash
pnpm exec dotenv -e .env.local -- node scripts/test-discount-activation.mjs
```

## ✅ Текущий статус

**Работает без BestBenefits API:**
- ✅ Локальное отслеживание активаций
- ✅ UI показывает статус
- ✅ Переход на сайт партнера
- ✅ Копирование промокодов

**Готово к интеграции с API:**
- ✅ Модуль активации создан
- ✅ API endpoint реализован
- ✅ Автоматическая синхронизация при регистрации
- ⏳ Ожидает подтверждения endpoint от BestBenefits

