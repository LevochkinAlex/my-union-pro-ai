# Система промокодов - Документация

## 📋 Обзор

Система промокодов обеспечивает отображение, синхронизацию и управление промокодами для активированных скидок пользователей. Промокоды синхронизируются с BestBenefits API и отображаются в удобном формате на страницах приложения.

## 🎯 Основные функции

1. **Отображение промокодов** - Красивое отображение промокодов в виде отдельных символов в квадратиках
2. **Специальные случаи** - Обработка случаев, когда вместо промокода используется штрихкод
3. **Синхронизация с BestBenefits** - Автоматическая синхронизация промокодов из BestBenefits API
4. **Копирование промокодов** - Удобная функция копирования промокода в буфер обмена

## 📊 Структура данных

### Формат хранения промокодов в БД

Промокоды хранятся в таблице `DiscountPreference` в поле `filters.claimed` в следующем формате:

```typescript
{
  filters: {
    claimed: [
      { id: 1259, promoCode: "SL-WC8F4-WGVZ3FU" },
      { id: 1817, promoCode: "Штрихкод в купоне" },
      { id: 102, promoCode: null } // Промокод отсутствует или деактивирован
    ],
    favorites: [1259, 1817, 102]
  }
}
```

### Типы промокодов

1. **Обычный промокод** - Строка с буквами и цифрами (например: `SL-WC8F4-WGVZ3FU`)
2. **Специальный случай** - Текст "Штрихкод в купоне" или похожие варианты
3. **Отсутствующий промокод** - `null` или пустая строка

## 🎨 Отображение промокодов

### Страница деталей скидки (`/dashboard/discounts/[id]`)

#### Обычный промокод

Когда промокод является обычной строкой, он отображается в виде отдельных символов в квадратиках:

```tsx
<div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4">
  <div className="mb-3 flex flex-wrap justify-center gap-1.5">
    {promoCode.split('').map((char, idx) => (
      <div key={idx} className="flex h-10 w-8 items-center justify-center rounded-lg border-2 border-blue-300 bg-white font-mono text-lg font-bold text-blue-700">
        {char}
      </div>
    ))}
  </div>
  <button onClick={handleCopyPromo}>
    Скопировать код
  </button>
</div>
```

**Особенности:**
- Каждый символ в отдельном квадрате
- Моноширинный шрифт (font-mono)
- Синяя цветовая схема
- Адаптивные размеры для мобильных устройств
- Кнопка копирования с визуальной обратной связью

#### Специальный случай: "Штрихкод в купоне"

Когда промокод равен "Штрихкод в купоне" или содержит слова "штрихкод" или "barcode", отображается инструкция:

```tsx
<div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4">
  <div className="mb-3 flex justify-center">
    <svg className="h-16 w-16 text-blue-600">
      {/* Иконка штрихкода */}
    </svg>
  </div>
  <h3 className="mb-2 text-center text-lg font-semibold">
    Используйте штрихкод из купона
  </h3>
  <p className="text-center text-sm text-gray-600">
    Покажите QR-код кассиру в магазине для получения скидки
  </p>
</div>
```

**Особенности:**
- Иконка штрихкода
- Инструкция для пользователя
- Нет кнопки копирования (так как копировать нечего)

#### Отсутствие промокода

Если промокод отсутствует или скидка не активирована, блок промокода не отображается. Вместо этого показывается описание скидки.

### Модальное окно активации

При активации скидки показывается модальное окно с промокодом:

```tsx
{(() => {
  const isSpecialCase = displayPromoCode && (
    displayPromoCode === "Штрихкод в купоне" ||
    displayPromoCode.toLowerCase().includes("штрихкод") ||
    displayPromoCode.toLowerCase().includes("barcode")
  );
  
  if (isSpecialCase) {
    return (
      <div>
        {/* Инструкция для штрихкода */}
      </div>
    );
  }
  
  return (
    <div>
      {/* Промокод в квадратиках */}
    </div>
  );
})()}
```

### Карточка скидки (`DiscountCard`)

На карточке скидки промокод отображается компактно:

- **Обычный промокод**: Кнопка с текстом "Промокод: ABC123" и иконкой копирования
- **Специальный случай**: Текст "Штрихкод в купоне" без кнопки копирования

## 🔄 Синхронизация с BestBenefits

### Процесс синхронизации

1. **Загрузка промокодов из BestBenefits**
   - Используется endpoint: `GET /api/received`
   - Требуется авторизация через личный токен пользователя
   - Возвращает список активированных скидок с промокодами

2. **Обработка ответа BestBenefits**
   ```typescript
   {
     data: [
       {
         id: 1817,
         name: "Розничные магазины ЛЕНТА",
         codes: [
           {
             id: 39962219,
             code: "Штрихкод в купоне",
             end_date: "2025-12-10T14:35:26.000000Z"
           }
         ]
       }
     ]
   }
   ```

3. **Обновление локальной БД**
   - Промокоды сохраняются в `DiscountPreference.filters.claimed`
   - Формат: `{ id: number, promoCode: string | null }`

### Функции синхронизации

#### `getUserActivatedDiscounts()`

Получает список активированных скидок из BestBenefits:

```typescript
const activatedDiscounts = await getUserActivatedDiscounts(
  bestBenefitsUserId,
  password
);
// Возвращает: [{ id: 1817, promoCode: "Штрихкод в купоне" }]
```

**Особенности:**
- Берет первый активный код из массива `codes`
- Игнорирует коды со статусом "Промокод деактивирован"
- Возвращает `undefined` для промокода, если все коды деактивированы

#### `syncWithBestBenefits()`

Синхронизирует промокоды для текущего пользователя:

```typescript
const syncWithBestBenefits = async () => {
  // 1. Получает активированные скидки из BestBenefits
  // 2. Обновляет локальные preferences
  // 3. Обновляет состояние компонента
};
```

### Автоматическая синхронизация

Синхронизация происходит автоматически в следующих случаях:

1. **При загрузке страницы деталей скидки**
   - Если скидка активирована, но промокод отсутствует
   - Только один раз, чтобы избежать бесконечного цикла

2. **После активации скидки**
   - После успешной активации через `/api/discounts/activate`
   - Промокод загружается из ответа API

3. **При открытии страницы "Мои скидки"**
   - Загружаются все активированные скидки с промокодами

## 🛠️ Утилиты и скрипты

### Скрипт проверки промокодов

```bash
pnpm dotenv -e .env.local -- tsx scripts/check-user-promo-codes.ts talik.e@mail.ru
```

Показывает все промокоды пользователя с их типами.

### Скрипт синхронизации промокодов

```bash
pnpm dotenv -e .env.local -- tsx scripts/sync-missing-promo-codes.ts talik.e@mail.ru
```

Синхронизирует промокоды из BestBenefits для пользователя.

### Скрипт активации скидок

```bash
pnpm dotenv -e .env.local -- tsx scripts/activate-user-discounts.ts talik.e@mail.ru
```

Повторно активирует все скидки пользователя для получения свежих промокодов.

## 📝 API Endpoints

### `GET /api/discounts/preferences`

Возвращает preferences пользователя, включая промокоды:

```json
{
  "filters": {
    "claimed": [
      { "id": 1817, "promoCode": "Штрихкод в купоне" },
      { "id": 1259, "promoCode": "SL-WC8F4-WGVZ3FU" }
    ],
    "favorites": [1817, 1259]
  }
}
```

### `POST /api/discounts/activate`

Активирует скидку и возвращает промокод:

```json
{
  "success": true,
  "promoCode": "SL-WC8F4-WGVZ3FU",
  "bestBenefitsActivated": true
}
```

## 🐛 Обработка ошибок

### Промокод отсутствует

Если промокод отсутствует в BestBenefits:
- В локальной БД сохраняется `promoCode: null`
- На странице блок промокода не отображается
- Показывается описание скидки

### Все промокоды деактивированы

Если все промокоды в BestBenefits имеют статус "Промокод деактивирован":
- `getUserActivatedDiscounts()` возвращает `promoCode: undefined`
- В локальной БД сохраняется `promoCode: null`
- Пользователь видит описание скидки вместо промокода

### Ошибки синхронизации

При ошибках синхронизации:
- Логируются в консоль
- Используются локальные данные
- Пользователь видит последний известный промокод

## 🎨 Стилизация

### Цветовая схема

- **Фон блока промокода**: `bg-gradient-to-br from-blue-50 to-blue-100`
- **Граница**: `border-2 border-blue-200`
- **Символы промокода**: `text-blue-700` на белом фоне
- **Кнопка копирования**: `bg-blue-600 hover:bg-blue-700`

### Адаптивность

- **Мобильные устройства**: Меньшие квадратики (`h-10 w-8 text-lg`)
- **Десктоп**: Большие квадратики (`sm:h-12 sm:w-10 sm:text-xl`)
- **Гибкая сетка**: `flex flex-wrap justify-center gap-1.5`

## 🔍 Отладка

### Логирование

Все операции с промокодами логируются в консоль:

```typescript
console.log("✅ Found promo code in preferences:", promoCode);
console.log("⚠️ Claimed item found but no promo code:", claimedItem);
console.log("🔄 Syncing with BestBenefits to get promo code...");
```

### Проверка состояния

Для проверки состояния промокодов используйте:

```typescript
// В компоненте
console.log("Promo code state:", {
  activatedPromoCode,
  discountPromoCode: discount?.promoCode,
  displayPromoCode,
  isClaimed
});
```

## 📚 Примеры использования

### Получение промокода для скидки

```typescript
const loadPreferences = async () => {
  const response = await fetch("/api/discounts/preferences");
  const data = await response.json();
  const filters = data.filters || {};
  
  const claimedItem = filters.claimed?.find((item: any) => {
    const itemId = typeof item === 'object' ? item.id : item;
    return itemId === discountId;
  });
  
  const promoCode = typeof claimedItem === 'object' 
    ? claimedItem.promoCode 
    : null;
    
  if (promoCode) {
    setActivatedPromoCode(promoCode);
  }
};
```

### Проверка специального случая

```typescript
const isSpecialCase = promoCode && (
  promoCode === "Штрихкод в купоне" ||
  promoCode.toLowerCase().includes("штрихкод") ||
  promoCode.toLowerCase().includes("barcode")
);
```

### Копирование промокода

```typescript
const handleCopyPromo = async () => {
  const promoToCopy = activatedPromoCode || discount?.promoCode;
  
  if (!promoToCopy || !navigator?.clipboard) return;
  
  try {
    await navigator.clipboard.writeText(promoToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch (error) {
    console.warn("Failed to copy promo code", error);
  }
};
```

## ✅ Чеклист проверки

При работе с промокодами проверьте:

- [ ] Промокод загружается из preferences при открытии страницы
- [ ] Промокод синхронизируется с BestBenefits при отсутствии
- [ ] Обычные промокоды отображаются в квадратиках
- [ ] Специальный случай "Штрихкод в купоне" показывает инструкцию
- [ ] Кнопка копирования работает корректно
- [ ] При отсутствии промокода блок не отображается
- [ ] Промокоды обновляются после активации скидки
- [ ] Адаптивность работает на мобильных устройствах

## 🔗 Связанные файлы

- `app/dashboard/discounts/[id]/page.tsx` - Страница деталей скидки
- `app/dashboard/discounts/my/page.tsx` - Страница "Мои скидки"
- `components/dashboard/discounts/DiscountCard.tsx` - Карточка скидки
- `lib/best-benefits-activation.ts` - Функции синхронизации с BestBenefits
- `scripts/check-user-promo-codes.ts` - Скрипт проверки промокодов
- `scripts/sync-missing-promo-codes.ts` - Скрипт синхронизации

## 📅 История изменений

### 2024-12-03
- Добавлена обработка специального случая "Штрихкод в купоне"
- Улучшено отображение промокодов в виде отдельных символов
- Добавлена автоматическая синхронизация с BestBenefits
- Исправлена логика отображения промокодов на странице деталей

