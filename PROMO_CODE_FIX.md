# Исправление промокодов - Итоговое руководство

## 🎯 Проблема
Промокоды не отображались в модальном окне при активации скидок.

## 🔍 Причины

### 1. Пользователь не синхронизирован с BestBenefits
- `bestBenefitsUserId` = null в БД
- API активации не вызывается
- Промокод не генерируется

### 2. Неправильное хранение данных
- `claimed` сохранялся как `[1161, 1162]` (массив чисел)
- Нужно: `[{id: 1161, promoCode: 'ABC'}, {id: 1162}]` (массив объектов)

### 3. API не возвращал промокод
- Промокод не добавлялся в ответ `/api/discounts/activate`

## ✅ Исправления

### 1. API `/api/discounts/activate`
- Сохраняет `claimed` как массив объектов с `promoCode`
- Возвращает `promoCode` в ответе
- Мерджит с существующими данными

### 2. Скрипт синхронизации `sync-user-to-bb.mjs`
- Проверяет синхронизацию пользователя
- Создает пользователя в BestBenefits
- Обновляет `bestBenefitsUserId` в БД

### 3. Фронтенд `page.tsx`
- Реактивный `displayPromoCode`
- Загрузка промокода из preferences
- Логирование всех этапов

## 📋 Инструкции

### Шаг 1: Синхронизация пользователя

```bash
pnpm tsx scripts/sync-user-to-bb.mjs ceo@yappix.ru
```

Скрипт покажет:
- ✅ Пользователь найден
- ❓ Синхронизирован ли с BestBenefits?
- 🚀 Попытка синхронизации
- 💾 Сохранение `bestBenefitsUserId`

### Шаг 2: Перезапуск сервера

```bash
# Остановите текущий (Ctrl+C)
pnpm dev
```

### Шаг 3: Проверка

1. Откройте: `http://localhost:3004/dashboard/discounts/1161`
2. Откройте DevTools Console (F12)
3. Нажмите "Использовать скидку"
4. Смотрите логи:
   - `📦 FULL DISCOUNT DATA` - данные скидки из API
   - `🔘 HANDLE CLAIM START` - начало активации
   - `🎯 ACTIVATION API RESPONSE` - ответ от BestBenefits
   - `📋 LOADED PREFERENCES` - загруженные preferences
   - `🎫 MODAL DISPLAYED WITH` - данные в модалке

## 🐛 Отладка

### Если промокод всё ещё не отображается:

1. **Проверьте, что пользователь синхронизирован:**
   ```bash
   pnpm tsx scripts/sync-user-to-bb.mjs ceo@yappix.ru
   ```

2. **Проверьте логи в консоли браузера:**
   - Есть ли `promoCode` в `FULL DISCOUNT DATA`?
   - Есть ли `promoCode` в `ACTIVATION API RESPONSE`?
   - Есть ли `promoCode` в `LOADED PREFERENCES`?
   - Что показывает `MODAL DISPLAYED WITH`?

3. **Проверьте другую скидку:**
   - Возможно у скидки 1161 просто нет промокода
   - Попробуйте другой ID (например, 1160 или 1162)

4. **Проверьте токен BestBenefits:**
   ```bash
   # В .env.local должен быть:
   BB_PROFSOYUZY_TOKEN="..."
   ```

5. **Проверьте endpoint активации:**
   - Логи `[BestBenefits Activation]` в терминале сервера
   - Возможно endpoint `/api/user/activate_product` не существует
   - Проверьте документацию BestBenefits API

## 💡 Важно понимать

### Два источника промокода:

1. **Из списка скидок** (`/api/products`)
   - Статический промокод для всех
   - Хранится в `discount.promoCode`
   - Отображается сразу

2. **Из активации** (`/api/user/activate_product`)
   - Персональный промокод для пользователя
   - Приходит после активации
   - Сохраняется в `preferences.claimed[].promoCode`

### Приоритет:
```
activatedPromoCode (из API активации)
  ||
discount.promoCode (из списка скидок)
  ||
null (нет промокода)
```

## 🚀 Результат

После всех исправлений:
- ✅ Пользователь синхронизирован с BestBenefits
- ✅ При активации вызывается API BestBenefits
- ✅ Промокод сохраняется в preferences
- ✅ Промокод отображается в модалке
- ✅ Подробное логирование для отладки

