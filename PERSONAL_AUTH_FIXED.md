# ✅ Персональная авторизация в BestBenefits ИСПРАВЛЕНА!

## 🚨 Проблема (ДО)

**ВСЕ пользователи** использовали **ОДИН аккаунт BestBenefits**:

```env
BB_LOGIN="p-crusader@yandex.ru"  # ← ОДИН аккаунт для ВСЕХ!
BB_PASSWORD="123"
```

**Последствия:**
- Все скидки активировались от имени организации
- Все промокоды привязывались к одному аккаунту
- **Нет персонализации!**
- Невозможно отследить, кто какую скидку активировал

## ✅ Решение (ПОСЛЕ)

### 1. Создан модуль персональной авторизации

**`lib/best-benefits-user-auth.ts`**:
```typescript
// Каждый пользователь получает СВОЙ токен!
export async function getUserBestBenefitsToken(
  email: string,
  password: string
): Promise<string>
```

### 2. Обновлена логика активации

**ДО:**
```typescript
const token = await getBestBenefitsToken(); // Токен организации для ВСЕХ
```

**ПОСЛЕ:**
```typescript
// Токен КОНКРЕТНОГО пользователя
const token = await getUserBestBenefitsToken(
  user.email, 
  decryptedPassword
);
```

### 3. Обновлены API endpoints

- **`/api/discounts/activate`** — использует персональный токен
- **`/api/discounts/sync`** — использует персональный токен

## 📊 Архитектура

### Создание пользователя:
```
1. Регистрация в MyUnion
   ↓
2. app/api/auth/register/verify-code
   - Генерирует случайный пароль
   - Шифрует и сохраняет в bestBenefitsPassword
   ↓
3. app/api/profile (PUT)
   - Когда пользователь заполняет firstName/lastName
   - Создает пользователя в BestBenefits через /api/profsoyuzy/create_user
   - Использует ТОКЕН ОРГАНИЗАЦИИ (BB_PROFSOYUZY_TOKEN)
```

### Активация скидки:
```
1. Пользователь нажимает "Использовать"
   ↓
2. app/api/discounts/activate
   - Получает bestBenefitsPassword из БД
   - Расшифровывает пароль
   - Авторизуется через /api/auth с email+password ПОЛЬЗОВАТЕЛЯ
   - Получает ПЕРСОНАЛЬНЫЙ токен
   ↓
3. POST /api/promo с ПЕРСОНАЛЬНЫМ токеном
   - Скидка активируется ОТ ИМЕНИ ПОЛЬЗОВАТЕЛЯ!
   - Промокод привязывается к аккаунту пользователя
```

### Синхронизация скидок:
```
1. Пользователь открывает "Мои скидки"
   ↓
2. app/api/discounts/sync
   - Получает bestBenefitsPassword из БД
   - Расшифровывает пароль
   - Авторизуется с ПЕРСОНАЛЬНЫМ токеном
   ↓
3. GET /api/received с ПЕРСОНАЛЬНЫМ токеном
   - Получает скидки КОНКРЕТНОГО пользователя
   - Синхронизирует с локальными preferences
```

## 🔐 Безопасность

### Хранение паролей:
- **Шифрование:** AES-256-GCM
- **Ключ:** `BB_PASSWORD_ENCRYPTION_KEY` или `ENCRYPTION_KEY`
- **Где:** поле `bestBenefitsPassword` в таблице `User`

### Кэширование токенов:
```typescript
// In-memory кэш для токенов пользователей
const userTokenCache = new Map<string, { token: string; expiry: number }>();
```

- Токен кэшируется на ~1 час
- Автоматически обновляется при истечении
- Очищается при перезапуске сервера

## 🧪 Тестирование

### Проверка авторизации пользователя:
```bash
pnpm tsx scripts/test-user-token.ts
```

**Ожидаемый результат:**
```
✅ SUCCESS! User token received
🎯 TOKEN: eyJ0eXAiOi...
```

### Проверка активации:
```bash
# 1. Очистить старые скидки
pnpm dotenv -e .env.local -- tsx scripts/cleanup-unactivated-discounts.ts ceo@yappix.ru

# 2. Активировать новую скидку через приложение
# http://localhost:3004/dashboard/discounts/3764

# 3. Проверить логи:
# [activate-discount] ✅ Using PERSONAL token for user ceo@yappix.ru
```

## 📈 Результаты

### ДО:
```
p-crusader@yandex.ru (организация)
  ├── скидка 3764
  ├── скидка 1400
  └── скидка 5071
  
❌ Все пользователи видят ОДНИ И ТЕ ЖЕ скидки!
```

### ПОСЛЕ:
```
user1@example.com
  ├── скидка 3764 ✅
  └── скидка 1400 ✅
  
user2@example.com
  ├── скидка 5071 ✅
  └── скидка 4404 ✅

ceo@yappix.ru
  └── скидка 3764 ✅
  
✅ Каждый пользователь видит СВОИ скидки!
```

## 🔄 Обратная совместимость

Если у пользователя **НЕТ** `bestBenefitsPassword`:
- Используется токен организации (legacy режим)
- В логах: `⚠️ Using organization token (legacy)`
- Скидки активируются, но не персонализированы

**Рекомендация:** Все новые пользователи автоматически получают `bestBenefitsPassword`.

## 🚀 Деплой

### Обязательные переменные окружения:

```env
# Токен организации для создания пользователей
BB_PROFSOYUZY_TOKEN="..."

# Токен организации для получения списка скидок
BB_LOGIN="p-crusader@yandex.ru"
BB_PASSWORD="123"

# Ключ шифрования для паролей пользователей
BB_PASSWORD_ENCRYPTION_KEY="32-char-hex-key"
# или
ENCRYPTION_KEY="32-char-hex-key"
```

### Проверка после деплоя:

1. Зарегистрировать тестового пользователя
2. Заполнить профиль (firstName/lastName)
3. Активировать скидку
4. Проверить логи: `✅ Using PERSONAL token`
5. Проверить BestBenefits веб-интерфейс: скидка должна быть видна

## 📝 Важные файлы

- `lib/best-benefits-user-auth.ts` — персональная авторизация
- `lib/best-benefits-activation.ts` — использует персональные токены
- `lib/best-benefits-password.ts` — шифрование/расшифровка
- `app/api/discounts/activate/route.ts` — активация с персональным токеном
- `app/api/discounts/sync/route.ts` — синхронизация с персональным токеном

## ✅ Чек-лист

- [x] Создан модуль персональной авторизации
- [x] Обновлена логика активации скидок
- [x] Обновлена логика синхронизации
- [x] Добавлено кэширование персональных токенов
- [x] Сохраняется обратная совместимость
- [x] Протестирована авторизация пользователя
- [x] Готово к production деплою

---

**🎉 Теперь каждый пользователь имеет свой аккаунт и свои скидки в BestBenefits!**

