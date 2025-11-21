# Синхронизация паролей с BestBenefits

## 🎯 Цель

Синхронизировать логин и пароль между нашей БД и BestBenefits при создании пользователя, чтобы пользователь мог использовать один и тот же пароль для входа в обе системы.

## ✅ Реализация

### 1. Хранение пароля BestBenefits

#### Проблема:
- Пароль в нашей БД хранится в захешированном виде (bcrypt)
- BestBenefits API требует незахешированный пароль
- Невозможно расшифровать bcrypt hash

#### Решение:
- Добавлено поле `bestBenefitsPassword` в модель `User`
- Пароль хранится в зашифрованном виде (AES-256-GCM)
- При синхронизации пароль расшифровывается и используется

### 2. Шифрование пароля

#### Утилита: `lib/best-benefits-password.ts`

```typescript
// Шифрование
encryptPassword(password: string): string

// Расшифровка
decryptPassword(encryptedPassword: string): string

// Проверка формата
isEncrypted(password: string): boolean
```

**Алгоритм:** AES-256-GCM
- **IV:** 16 байт (случайный)
- **Salt:** 64 байта (случайный)
- **Tag:** 16 байт (для аутентификации)
- **Формат:** `salt(hex) + iv(hex) + tag(hex) + encrypted(hex)`

**Безопасность:**
- Ключ шифрования из `BB_PASSWORD_ENCRYPTION_KEY` или `ENCRYPTION_KEY`
- Используется GCM режим для аутентификации
- Salt и IV генерируются случайно для каждого пароля

### 3. Поток синхронизации

#### При регистрации (`/api/auth/register/verify-code`):

```
1. Пользователь подтверждает email
   ↓
2. Генерируется случайный пароль
   ↓
3. Пароль хешируется (bcrypt) → password
   ↓
4. Пароль шифруется (AES) → bestBenefitsPassword
   ↓
5. Оба сохраняются в БД
   ↓
6. Пароль отправляется пользователю по email
```

#### При заполнении профиля (`/api/profile`):

```
1. Пользователь заполняет ФИО
   ↓
2. Проверяется: есть ли bestBenefitsUserId?
   ↓
3. Если нет → синхронизация с BestBenefits
   ↓
4. Расшифровывается bestBenefitsPassword
   ↓
5. Создается пользователь в BestBenefits с этим паролем
   ↓
6. Сохраняется bestBenefitsUserId
```

### 4. Обновление существующих пользователей

#### Скрипт: `scripts/update-bb-password.ts`

```bash
pnpm dotenv -e .env.local -- tsx scripts/update-bb-password.ts EMAIL PASSWORD
```

**Пример:**
```bash
pnpm dotenv -e .env.local -- tsx scripts/update-bb-password.ts ceo@yappix.ru "w+Aj7UH5/FpB"
```

**Что делает:**
1. Находит пользователя по email
2. Шифрует указанный пароль
3. Сохраняет в `bestBenefitsPassword`
4. При следующей синхронизации будет использован этот пароль

## 📋 Изменения в коде

### 1. Схема БД (`prisma/schema.prisma`)

```prisma
model User {
  // ...
  bestBenefitsPassword String? // Пароль для BestBenefits (зашифрован AES-256-GCM)
}
```

### 2. Регистрация (`app/api/auth/register/verify-code/route.ts`)

```typescript
// Генерируем пароль
const generatedPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
const hashedPassword = await bcrypt.hash(generatedPassword, 10);
const encryptedBbPassword = encryptPassword(generatedPassword);

// Сохраняем оба
await prisma.user.update({
  data: {
    password: hashedPassword, // Для нашей системы
    bestBenefitsPassword: encryptedBbPassword, // Для BestBenefits
  },
});
```

### 3. Синхронизация (`app/api/profile/route.ts`)

```typescript
// Получаем пользователя с паролем
const userBeforeUpdate = await prisma.user.findUnique({
  select: { bestBenefitsPassword: true },
});

// Расшифровываем пароль
if (userBeforeUpdate?.bestBenefitsPassword) {
  bbPassword = decryptPassword(userBeforeUpdate.bestBenefitsPassword);
} else {
  // Fallback: генерируем новый (для старых пользователей)
  bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
}

// Создаем в BestBenefits
syncUserToBestBenefits({
  password: bbPassword, // Используем тот же пароль
});
```

## 🔐 Безопасность

### Хранение паролей:

1. **Наша система:**
   - Пароль: bcrypt hash (одностороннее хеширование)
   - Нельзя расшифровать
   - Используется для проверки входа

2. **BestBenefits:**
   - Пароль: AES-256-GCM (симметричное шифрование)
   - Можно расшифровать с ключом
   - Используется для создания пользователя в BestBenefits

### Ключ шифрования:

- Переменная окружения: `BB_PASSWORD_ENCRYPTION_KEY` или `ENCRYPTION_KEY`
- Должен быть длиной минимум 32 символа
- Хранится в `.env.local` (не коммитится в git)

### Рекомендации:

1. ✅ Используйте сильный ключ шифрования
2. ✅ Храните `.env.local` в безопасности
3. ✅ Не логируйте расшифрованные пароли
4. ✅ Регулярно ротируйте ключ шифрования

## 🔄 Миграция существующих пользователей

### Для пользователя ceo@yappix.ru:

```bash
# Установить пароль BestBenefits
pnpm dotenv -e .env.local -- tsx scripts/update-bb-password.ts ceo@yappix.ru "w+Aj7UH5/FpB"
```

**Результат:**
- Пароль сохранен в зашифрованном виде
- При следующей синхронизации будет использован этот пароль
- Пользователь может войти на bestbenefits.ru с этим паролем

## 📊 Поток данных

### Новый пользователь:

```
Регистрация
  ↓
Генерация пароля: "abc123"
  ↓
┌─────────────────────────┐
│ password: bcrypt("abc123")│
│ bestBenefitsPassword:    │
│   AES("abc123")          │
└─────────────────────────┘
  ↓
Email с паролем: "abc123"
  ↓
Заполнение профиля (ФИО)
  ↓
Синхронизация с BestBenefits
  ↓
Расшифровка: AES → "abc123"
  ↓
BestBenefits API: create_user(password: "abc123")
  ↓
✅ Пользователь создан с паролем "abc123"
```

### Существующий пользователь:

```
Обновление пароля BestBenefits
  ↓
Скрипт: update-bb-password.ts
  ↓
Шифрование: AES("w+Aj7UH5/FpB")
  ↓
Сохранение в БД
  ↓
При следующей синхронизации:
  ↓
Расшифровка → "w+Aj7UH5/FpB"
  ↓
BestBenefits API: create_user(password: "w+Aj7UH5/FpB")
```

## 🚀 Использование

### Для новых пользователей:

1. ✅ Автоматически при регистрации
2. ✅ Пароль сохраняется в зашифрованном виде
3. ✅ При заполнении профиля синхронизируется с BestBenefits
4. ✅ Используется тот же пароль, что и в нашей системе

### Для существующих пользователей:

1. ✅ Используйте скрипт `update-bb-password.ts`
2. ✅ Установите пароль, который совпадает с паролем в BestBenefits
3. ✅ При следующей синхронизации будет использован этот пароль

## 💡 Важные моменты

### 1. Пароль должен совпадать

Если пользователь изменил пароль на bestbenefits.ru вручную:
- Обновите `bestBenefitsPassword` через скрипт
- Используйте тот же пароль, что и на BestBenefits

### 2. Fallback для старых пользователей

Если `bestBenefitsPassword` отсутствует:
- Генерируется новый случайный пароль
- Пользователь может восстановить его через BestBenefits

### 3. Безопасность ключа

⚠️ **ВАЖНО:** Если ключ шифрования потерян:
- Все зашифрованные пароли станут недоступны
- Нужно будет пересоздать пользователей в BestBenefits

## 📄 Файлы

### Новые файлы:
- `lib/best-benefits-password.ts` - утилиты шифрования
- `scripts/update-bb-password.ts` - скрипт обновления пароля
- `prisma/migrations/.../migration.sql` - миграция БД

### Измененные файлы:
- `prisma/schema.prisma` - добавлено поле `bestBenefitsPassword`
- `app/api/auth/register/verify-code/route.ts` - сохранение пароля при регистрации
- `app/api/profile/route.ts` - использование сохраненного пароля при синхронизации

## ✅ Результат

### До:
- ❌ Пароль генерировался случайно при синхронизации
- ❌ Пользователь не знал пароль для BestBenefits
- ❌ Нужно было восстанавливать пароль вручную

### После:
- ✅ Пароль сохраняется при регистрации
- ✅ Используется тот же пароль, что и в нашей системе
- ✅ Пользователь знает пароль (получил по email)
- ✅ Можно обновить пароль через скрипт

## 🔍 Тестирование

### Тест 1: Регистрация нового пользователя
```
1. Зарегистрировать нового пользователя
2. Проверить: bestBenefitsPassword установлен ✅
3. Заполнить профиль (ФИО)
4. Проверить: пользователь создан в BestBenefits с тем же паролем ✅
```

### Тест 2: Обновление пароля существующего пользователя
```
1. Запустить: update-bb-password.ts ceo@yappix.ru "password"
2. Проверить: bestBenefitsPassword обновлен ✅
3. Пересоздать пользователя в BestBenefits
4. Проверить: вход с паролем "password" ✅
```

### Тест 3: Синхронизация с сохраненным паролем
```
1. Пользователь с bestBenefitsPassword
2. Заполнить профиль (ФИО)
3. Проверить: используется сохраненный пароль ✅
4. Проверить: пользователь создан в BestBenefits ✅
```

