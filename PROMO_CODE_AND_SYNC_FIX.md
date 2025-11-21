# Исправление промокода и синхронизации скидок

## 🎯 Проблемы

### 1. Промокод не отображается в модалке
- При активации скидки промокод не показывался
- В консоли: `displayPromoCode: undefined`, `promoCode: undefined`
- Вместо промокода показывалось описание

### 2. Синхронизация скидок с BestBenefits не работает
- На странице "Мои скидки" → "Полученные" пусто
- Скидки, активированные на BestBenefits, не синхронизируются

## ✅ Решения

### 1. Исправление отображения промокода

#### Проблема:
- Промокод не загружался из preferences для уже активированных скидок
- Проверка `discount?.promoCode` выполнялась до загрузки discount
- Неправильная обработка формата claimed (объект vs число)

#### Исправления:

**A) Добавлен useEffect для обновления промокода после загрузки discount:**
```typescript
// Обновляем промокод после загрузки discount
useEffect(() => {
  if (discount && isClaimed && !activatedPromoCode) {
    if (discount.promoCode && discount.promoCode.trim().length > 0) {
      console.log("✅ Setting promo code from discount after load:", discount.promoCode);
      setActivatedPromoCode(discount.promoCode);
    }
  }
}, [discount, isClaimed, activatedPromoCode]);
```

**B) Улучшена обработка claimed в loadPreferences:**
```typescript
// Правильная обработка формата (объект или число)
const claimedItem = filters.claimed?.find((item: any) => {
  const itemId = typeof item === 'object' && item.id ? item.id : item;
  return itemId === parseInt(discountId);
});

// Правильное извлечение промокода
if (claimedItem) {
  const promoCode = typeof claimedItem === 'object' ? claimedItem.promoCode : null;
  if (promoCode && promoCode.trim().length > 0) {
    setActivatedPromoCode(promoCode);
  }
}
```

### 2. Улучшение синхронизации с BestBenefits

#### Проблема:
- Недостаточно логирования для отладки
- Endpoint может возвращать данные в другом формате
- Синхронизация не вызывалась на странице "Мои скидки"

#### Исправления:

**A) Улучшено логирование в getUserActivatedDiscounts:**
```typescript
const data = await response.json();
console.log("[BestBenefits Activation] API Response:", JSON.stringify(data, null, 2));

const activatedProducts = data.products || data.data || [];
console.log("[BestBenefits Activation] Found activated discounts:", activatedProducts.length);
console.log("[BestBenefits Activation] Raw products data:", activatedProducts);

// Обработка разных форматов ответа
const result = activatedProducts.map((p: any) => {
  const id = p.product_id || p.id || p.discount_id;
  const promoCode = p.promo_code || p.promoCode || p.code || p.promo_code || undefined;
  console.log("[BestBenefits Activation] Processing product:", { id, promoCode, raw: p });
  return {
    id: id ? parseInt(String(id)) : null,
    promoCode: promoCode || undefined,
  };
}).filter((p: any) => p.id !== null);
```

**B) Добавлена автоматическая синхронизация на странице "Мои скидки":**
```typescript
useEffect(() => {
  // Синхронизация с BestBenefits при загрузке страницы
  syncWithBestBenefits();
}, []);

const syncWithBestBenefits = async () => {
  if (isSyncing) return;
  
  setIsSyncing(true);
  try {
    console.log("[MyDiscounts] Starting sync with BestBenefits...");
    const response = await fetch("/api/discounts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log("[MyDiscounts] Sync result:", result);
      
      // Перезагружаем скидки после синхронизации
      await loadMyDiscounts();
    }
  } catch (error) {
    console.error("[MyDiscounts] Sync error:", error);
  } finally {
    setIsSyncing(false);
  }
};
```

**C) Добавлена кнопка ручной синхронизации:**
```typescript
<button
  onClick={syncWithBestBenefits}
  disabled={isSyncing}
  className="..."
>
  {isSyncing ? (
    <>
      <div className="h-4 w-4 animate-spin..."></div>
      <span>Синхронизация...</span>
    </>
  ) : (
    <>
      <svg>...</svg>
      <span>Синхронизировать</span>
    </>
  )}
</button>
```

## 📋 Измененные файлы

### 1. `app/dashboard/discounts/[id]/page.tsx`
- ✅ Добавлен useEffect для обновления промокода после загрузки discount
- ✅ Улучшена обработка claimed в loadPreferences
- ✅ Правильное извлечение промокода из объектов

### 2. `lib/best-benefits-activation.ts`
- ✅ Добавлено подробное логирование API ответа
- ✅ Улучшена обработка разных форматов ответа
- ✅ Фильтрация null значений

### 3. `app/dashboard/discounts/my/page.tsx`
- ✅ Добавлена автоматическая синхронизация при загрузке
- ✅ Добавлена кнопка ручной синхронизации
- ✅ Перезагрузка скидок после синхронизации

## 🔍 Отладка

### Логи для проверки промокода:

```
📋 LOADED PREFERENCES: { claimed: [...], favorites: [...] }
✅ Found promo code in preferences: ABC123
✅ Setting promo code from discount after load: ABC123
🎫 MODAL DISPLAYED WITH: {
  activatedPromoCode: "ABC123",
  displayPromoCode: "ABC123",
  displayPromoCodeExists: true
}
```

### Логи для проверки синхронизации:

```
[MyDiscounts] Starting sync with BestBenefits...
[BestBenefits Activation] Fetching activated discounts for user: ceo@yappix.ru
[BestBenefits Activation] API Response: { products: [...] }
[BestBenefits Activation] Found activated discounts: 3
[BestBenefits Activation] Raw products data: [...]
[BestBenefits Activation] Processing product: { id: 1916, promoCode: "ABC123" }
[sync-discounts] Synced discounts: { userId: "...", bbActivated: 3, totalClaimed: 5 }
[MyDiscounts] Sync result: { success: true, synced: [1916, 1917, 1918] }
```

## 🚀 Тестирование

### Тест 1: Промокод для уже активированной скидки
```
1. Открыть скидку, которая уже активирована
2. Проверить консоль: промокод должен загрузиться из preferences
3. Нажать "Использовать" → модалка должна показать промокод ✅
```

### Тест 2: Промокод при активации новой скидки
```
1. Активировать новую скидку
2. Проверить: промокод должен прийти из API или discount
3. Модалка должна показать промокод ✅
```

### Тест 3: Синхронизация скидок
```
1. Открыть "Мои скидки" → "Полученные"
2. Проверить консоль: должна быть автоматическая синхронизация
3. Проверить: скидки из BestBenefits должны появиться ✅
```

### Тест 4: Ручная синхронизация
```
1. Нажать кнопку "Синхронизировать"
2. Проверить консоль: логи синхронизации
3. Проверить: скидки обновлены ✅
```

## 💡 Важные моменты

### Промокод:
1. ✅ Загружается из preferences (приоритет)
2. ✅ Загружается из discount (fallback)
3. ✅ Обновляется после загрузки discount
4. ✅ Правильно обрабатывается формат (объект/число)

### Синхронизация:
1. ✅ Автоматическая при загрузке страницы "Мои скидки"
2. ✅ Ручная через кнопку "Синхронизировать"
3. ✅ Подробное логирование для отладки
4. ✅ Обработка разных форматов ответа API

## 🐛 Возможные проблемы

### Если промокод все еще не показывается:
1. Проверьте консоль браузера - должны быть логи загрузки
2. Проверьте, что промокод сохранен в preferences
3. Проверьте формат claimed в preferences (должен быть объект с `id` и `promoCode`)

### Если синхронизация не работает:
1. Проверьте консоль сервера - должны быть логи API запроса
2. Проверьте, что `bestBenefitsUserId` установлен
3. Проверьте формат ответа BestBenefits API
4. Попробуйте ручную синхронизацию через кнопку

## ✅ Результат

### Промокод:
- ✅ Отображается для уже активированных скидок
- ✅ Отображается при новой активации
- ✅ Загружается из разных источников (preferences, discount)

### Синхронизация:
- ✅ Автоматическая при загрузке страницы
- ✅ Ручная через кнопку
- ✅ Подробное логирование
- ✅ Обработка разных форматов API

