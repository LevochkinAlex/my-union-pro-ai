# Исправление промокода и пересоздание пользователя BestBenefits

## 🎯 Проблемы

### 1. Промокод не виден в модалке
Промокод не отображался после активации скидки, вместо него показывалось описание.

### 2. Пользователь не может войти в BestBenefits
Пользователь был создан со случайным паролем, который неизвестен.

## ✅ Решения

### 1. Исправление отображения промокода

#### Проблема:
- Промокод не устанавливался из `discount.promoCode` если его не было в API ответе
- Промокод не загружался из `discount` при загрузке preferences

#### Исправления:

**A) При активации скидки:**
```typescript
// Если промокод пришел из API - используем его
if (result.promoCode && result.promoCode.trim().length > 0) {
  setActivatedPromoCode(result.promoCode);
} else if (discount.promoCode && discount.promoCode.trim().length > 0) {
  // ИСПРАВЛЕНО: Используем промокод из discount, если он есть
  setActivatedPromoCode(discount.promoCode);
}
```

**B) При загрузке preferences:**
```typescript
// Если промокод есть в preferences - используем его
if (claimedItem?.promoCode) {
  setActivatedPromoCode(claimedItem.promoCode);
} else if (isClaimed && discount?.promoCode) {
  // ИСПРАВЛЕНО: Используем промокод из discount, если скидка claimed
  setActivatedPromoCode(discount.promoCode);
}
```

### 2. Пересоздание пользователя в BestBenefits

#### Шаг 1: Удалите пользователя из BestBenefits
- Обратитесь в поддержку BestBenefits
- Или используйте админ-панель (если есть доступ)
- Email для удаления: `ceo@yappix.ru`

#### Шаг 2: Запустите скрипт пересоздания
```bash
pnpm dotenv -e .env.local -- tsx scripts/recreate-bb-user.ts ceo@yappix.ru "w+Aj7UH5/FpB"
```

#### Шаг 3: Проверьте вход
После успешного создания:
1. Откройте https://bestbenefits.ru/login
2. Введите email: `ceo@yappix.ru`
3. Введите пароль: `w+Aj7UH5/FpB`
4. Войдите в систему

## 📋 Скрипты

### `scripts/recreate-bb-user.ts`
Пересоздает пользователя в BestBenefits с указанным паролем.

**Использование:**
```bash
pnpm dotenv -e .env.local -- tsx scripts/recreate-bb-user.ts EMAIL PASSWORD
```

**Пример:**
```bash
pnpm dotenv -e .env.local -- tsx scripts/recreate-bb-user.ts ceo@yappix.ru "w+Aj7UH5/FpB"
```

**Что делает:**
1. Проверяет наличие пользователя в нашей БД
2. Проверяет наличие ФИО
3. Создает пользователя в BestBenefits API
4. Обновляет `bestBenefitsUserId` и `bestBenefitsStatus` в БД
5. Выводит данные для входа

**Ошибки:**
- Если пользователь уже существует → нужно удалить из BestBenefits
- Если нет ФИО → заполните профиль
- Если ошибка авторизации → проверьте `BB_PROFSOYUZY_TOKEN`

## 🔄 Поток промокода

### Сценарий 1: Промокод из BestBenefits API
```
1. Пользователь активирует скидку
   ↓
2. POST /api/discounts/activate
   ↓
3. BestBenefits API возвращает promoCode
   ↓
4. Сохраняется в preferences.claimed[].promoCode
   ↓
5. Отображается в модалке ✅
```

### Сценарий 2: Промокод из discount
```
1. Скидка уже имеет promoCode
   ↓
2. Пользователь активирует скидку
   ↓
3. BestBenefits API не возвращает promoCode
   ↓
4. Используется discount.promoCode ✅
   ↓
5. Отображается в модалке ✅
```

### Сценарий 3: Загрузка страницы с claimed скидкой
```
1. Страница загружается
   ↓
2. loadPreferences() вызывается
   ↓
3. Проверяется preferences.claimed[].promoCode
   ↓
4. Если нет → проверяется discount.promoCode ✅
   ↓
5. Устанавливается activatedPromoCode ✅
```

## 💾 Измененные файлы

### app/dashboard/discounts/[id]/page.tsx
- ✅ Исправлена логика установки промокода при активации
- ✅ Добавлена проверка промокода из discount при загрузке preferences
- ✅ Промокод теперь всегда отображается, если доступен

### scripts/recreate-bb-user.ts (новый)
- ✅ Скрипт для пересоздания пользователя в BestBenefits
- ✅ Проверка существования пользователя
- ✅ Обработка ошибок с понятными сообщениями

## 🐛 Исправленные баги

### Баг 1: Промокод не отображался
**Проблема:**
- Если BestBenefits API не возвращал промокод, использовался `shortDescription`
- Промокод из `discount.promoCode` игнорировался

**Решение:**
- Добавлена проверка `discount.promoCode` при активации
- Добавлена проверка `discount.promoCode` при загрузке preferences
- Промокод всегда приоритетнее описания

### Баг 2: Пользователь не мог войти
**Проблема:**
- Пользователь создан со случайным паролем
- Пароль неизвестен

**Решение:**
- Скрипт для пересоздания с известным паролем
- Инструкции по удалению пользователя из BestBenefits

## 🚀 Тестирование

### Тест 1: Промокод из API
```
1. Активируйте скидку, которая возвращает промокод из BestBenefits
2. Ожидается: Промокод отображается в модалке ✅
```

### Тест 2: Промокод из discount
```
1. Активируйте скидку, у которой есть promoCode в данных
2. BestBenefits API не возвращает промокод
3. Ожидается: Промокод из discount отображается ✅
```

### Тест 3: Пересоздание пользователя
```
1. Удалите ceo@yappix.ru из BestBenefits
2. Запустите: recreate-bb-user.ts ceo@yappix.ru "password"
3. Ожидается: Пользователь создан ✅
4. Войдите на bestbenefits.ru/login ✅
```

## 📊 Логи для отладки

### Промокод при активации:
```
✅ Setting promo code from API: ABC123
✅ Using discount's promo code: XYZ789
⚠️ No promo code available
```

### Промокод при загрузке:
```
✅ Found promo code in preferences: ABC123
✅ Using promo code from discount: XYZ789
⚠️ No promo code in preferences for discount 1916
```

### Модалка:
```
🎫 MODAL DISPLAYED WITH: {
  activatedPromoCode: "ABC123",
  discountPromoCode: "ABC123",
  displayPromoCode: "ABC123",
  displayPromoCodeExists: true
}
```

## 💡 Рекомендации

### Для будущих пользователей:
1. **Используйте известный пароль** при создании в BestBenefits
2. **Сохраняйте пароль** в безопасном месте (для тестовых аккаунтов)
3. **Или используйте восстановление пароля** через email

### Для промокодов:
1. **Всегда проверяйте** `discount.promoCode` как fallback
2. **Сохраняйте промокоды** в preferences после активации
3. **Логируйте** все случаи отсутствия промокода

## ✅ Итог

### Промокод:
- ✅ Отображается из API ответа
- ✅ Отображается из discount.promoCode
- ✅ Отображается из preferences
- ✅ Всегда приоритетнее описания

### Пользователь:
- ✅ Можно пересоздать с известным паролем
- ✅ Скрипт с понятными инструкциями
- ✅ Обработка всех ошибок

