# Исправление меню и синхронизации скидок

## 🎯 Проблемы

### 1. Меню: все пункты выделены при `/dashboard/discounts/my`
- При открытии "Мои скидки и льготы" основной пункт "Скидки" был полностью синим
- Не было визуального различия между активным основным пунктом и активным подпунктом
- Подменю не раскрывалось автоматически

### 2. Синхронизация с BestBenefits
- Пользователь мог активировать скидку напрямую на сайте BestBenefits
- Наше приложение не знало об этих активациях
- Не было автоматической синхронизации

## ✅ Решения

### 1. Исправление меню (`components/dashboard/Sidebar.tsx`)

#### Изменения в логике активного состояния:
```typescript
// Проверка активного подпункта
const isSubItemActive = hasSubItems && item.subItems!.some(
  (subItem) => pathname === subItem.href || pathname.startsWith(subItem.href + "/")
);

// Основной пункт активен только если мы точно на нём
const isMainItemActive = pathname === item.href;

// Автоматическое раскрытие при активном подпункте
const isExpanded = expandedItems.includes(item.href) || isSubItemActive;
```

#### Визуальное различие:
- **Основной пункт активен** (`/dashboard/discounts`): полностью синий
- **Подпункт активен** (`/dashboard/discounts/my`): 
  - Основной пункт: светло-синий фон (`bg-blue-50`)
  - Активный подпункт: синий текст и фон

### 2. Синхронизация с BestBenefits

#### Новая функция `getUserActivatedDiscounts` (`lib/best-benefits-activation.ts`)
```typescript
export async function getUserActivatedDiscounts(
  bestBenefitsUserId: string
): Promise<Array<{ id: number; promoCode?: string }>>
```
Получает список всех активированных скидок пользователя с BestBenefits API.

#### Новый endpoint `/api/discounts/sync` (`app/api/discounts/sync/route.ts`)
- Получает активированные скидки с BestBenefits
- Мерджит с локальными preferences
- Обновляет `claimed` с промокодами

#### Автоматическая синхронизация (`components/dashboard/discounts/DiscountsClient.tsx`)
```typescript
useEffect(() => {
  const syncWithBestBenefits = async () => {
    // Синхронизация при загрузке страницы
    const response = await fetch("/api/discounts/sync", { method: "POST" });
    // Обновление claimed discounts
  };
  syncWithBestBenefits();
}, []); // Run once on mount
```

## 📋 Поток синхронизации

### Когда пользователь активирует скидку на BestBenefits:
1. ✅ Пользователь открывает сайт партнера через BestBenefits
2. ✅ Активирует скидку там напрямую
3. ✅ BestBenefits сохраняет активацию в своей БД

### Когда пользователь открывает наше приложение:
1. ✅ Загружается страница скидок
2. ✅ Вызывается `/api/discounts/sync`
3. ✅ Запрашиваются активированные скидки с BestBenefits API
4. ✅ Мерджится с локальными preferences
5. ✅ Обновляется UI - скидки помечены как "Получено"

## 🔍 API Endpoints

### `POST /api/discounts/sync`
Синхронизирует активированные скидки с BestBenefits.

**Запрос:** Нет параметров (использует session)

**Ответ:**
```json
{
  "success": true,
  "message": "Синхронизировано 3 скидок с BestBenefits",
  "synced": [1161, 1162, 1163],
  "totalClaimed": 5
}
```

### Используемый BestBenefits API endpoint:
```
GET /api/user/products?user_id={bestBenefitsUserId}
```

**Ответ:**
```json
{
  "products": [
    {
      "id": 1161,
      "product_id": 1161,
      "promo_code": "ABC123",
      "activated_at": "2025-11-21T10:00:00Z"
    }
  ]
}
```

## 💡 Важные детали

### Формат claimed в preferences
```typescript
{
  claimed: [
    { id: 1161, promoCode: "ABC123" }, // Из BestBenefits
    { id: 1162, promoCode: null },     // Локальная активация
    { id: 1163 }                       // Старый формат (преобразуется)
  ]
}
```

### Мерджинг данных
1. Существующие локальные claimed сохраняются
2. Добавляются новые из BestBenefits
3. Промокоды обновляются если пришли с BB
4. Не удаляются локальные активации

### Обработка ошибок
- Если пользователь не синхронизирован (`!bestBenefitsUserId`): пропускаем
- Если API недоступен: логируем warning, не блокируем работу
- Если нет активированных скидок: возвращаем пустой массив

## 🚀 Результат

### Меню:
- ✅ Правильное выделение активных пунктов
- ✅ Визуальное различие между основным и подпунктом
- ✅ Автоматическое раскрытие подменю

### Синхронизация:
- ✅ Автоматическая проверка при загрузке
- ✅ Мерджинг с локальными данными
- ✅ Сохранение промокодов
- ✅ Работа оффлайн (не блокирует если API недоступен)

## 🔄 Тестирование

### Сценарий 1: Активация на BestBenefits
1. Активируйте скидку на сайте BestBenefits
2. Откройте наше приложение
3. Перейдите в "Скидки"
4. Скидка должна быть помечена как "Получено" ✅

### Сценарий 2: Меню
1. Откройте "Скидки" → "Мои скидки и льготы"
2. Основной пункт "Скидки": светло-синий фон
3. Подпункт "Мои скидки и льготы": синий текст
4. Подменю раскрыто автоматически ✅

### Сценарий 3: Оффлайн
1. Отключите сеть
2. Откройте "Скидки"
3. Синхронизация не блокирует загрузку
4. Локальные claimed работают ✅

## 📊 Мониторинг

### Логи в консоли браузера:
```
[DiscountsClient] Synced with BestBenefits: {
  success: true,
  synced: [1161, 1162],
  totalClaimed: 5
}
```

### Логи на сервере:
```
[BestBenefits Activation] Fetching activated discounts for user: ceo@yappix.ru
[BestBenefits Activation] Found activated discounts: 3
[sync-discounts] Synced discounts: {
  userId: "cmhz9coo7001bp1tgwvpv9rmd",
  bbActivated: 3,
  totalClaimed: 5
}
```

## 🔐 Безопасность

- ✅ Проверка авторизации через session
- ✅ Только собственные данные пользователя
- ✅ Нет утечки данных других пользователей
- ✅ Валидация bestBenefitsUserId

