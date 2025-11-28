# BestBenefits: API сброса пароля по email и коду

Обновлено: 28 ноября 2024

## Базовая информация

- **Базовый URL**: `https://bestbenefits.ru/api/`
- **Формат**: `Content-Type: application/json`
- **Источник**: password_reset.pdf

## Ограничения по частоте запросов

- **Запрос кода сброса**: не более 3 запросов/минуту
- **Смена пароля по коду**: не более 5 запросов/минуту
- **При превышении**: `429 Too Many Requests`

## 1. Запрос кода сброса пароля

### Endpoint

```
POST https://bestbenefits.ru/api/password/forgot
```

### Описание

Отправляет на указанный email шестизначный код для сброса пароля.

**Параметры кода:**
- Состоит из 6 цифр
- Действует 15 минут
- Максимум 5 попыток ввода

### Тело запроса

```json
{
  "email": "user@example.com"
}
```

### Параметры

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| email | string | да | Email аккаунта в системе |

### Варианты ответов

#### ✅ Успешный ответ (200 OK)

```json
{
  "status": "success",
  "message": "Если аккаунт с таким email существует, код отправлен."
}
```

#### ❌ Ошибка валидации (422)

```json
{
  "status": "error",
  "message": "Исправьте отмеченные поля.",
  "errors": {
    "email": [
      "Укажите e-mail"
    ]
  }
}
```

#### ❌ Пользователь не найден (422)

```json
{
  "status": "error",
  "message": "Пройдите регистрацию на сайте."
}
```

#### ⚠️ Превышен лимит (429)

HTTP 429 Too Many Requests

### Пример cURL

```bash
curl -X POST "https://bestbenefits.ru/api/password/forgot" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

## 2. Смена пароля по коду

### Endpoint

```
POST https://bestbenefits.ru/api/password/reset
```

### Описание

Принимает email, код из письма и новый пароль. При успехе:
- Пароль обновляется
- Все коды сброса для этого email удаляются

**Параметры кода:**
- Шестизначный (6 символов)
- Действителен 15 минут
- Лимит 5 попыток ввода

### Тело запроса

```json
{
  "email": "user@example.com",
  "code": "123456",
  "password": "NewSecurePassword123!",
  "password_confirmation": "NewSecurePassword123!"
}
```

### Параметры

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| email | string | да | Email пользователя |
| code | string | да | 6-значный код из письма |
| password | string | да | Новый пароль (мин. 8 символов) |
| password_confirmation | string | да | Подтверждение пароля |

### Варианты ответов

#### ✅ Успешный сброс (200 OK)

```json
{
  "status": "success",
  "message": "Пароль успешно сменён."
}
```

#### ❌ Пользователь не найден (422)

```json
{
  "status": "error",
  "message": "Что-то пошло не так."
}
```

#### ❌ Ошибка валидации (422)

```json
{
  "status": "error",
  "message": "Исправьте отмеченные поля.",
  "errors": {
    "password": {
      "Пароль должен быть не менее 8 символов."
    }
  }
}
```

#### ❌ Невалидный код (422)

```json
{
  "status": "error",
  "message": "Невалидный код или срок действия истёк."
}
```

#### ❌ Код истёк (422)

```json
{
  "status": "error",
  "message": "Время жизни кода истекло. Попробуйте снова."
}
```

#### ❌ Неверный код (422)

```json
{
  "status": "error",
  "message": "Невалидный код"
}
```

#### ⚠️ Превышено попыток (429)

```json
{
  "status": "error",
  "message": "Слишком много попыток. Запросите новый код."
}
```

#### ⚠️ Превышен лимит запросов (429)

HTTP 429 Too Many Requests

### Пример cURL

```bash
curl -X POST "https://bestbenefits.ru/api/password/reset" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "code": "123456",
    "password": "NewSecurePassword123!",
    "password_confirmation": "NewSecurePassword123!"
  }'
```

## Рекомендуемый UX-сценарий

1. **Экран "Забыли пароль?"**
   - Пользователь вводит email
   - Приложение → `POST /password/forgot`

2. **Получение кода**
   - Пользователь получает письмо с 6-значным кодом
   - Код действителен 15 минут

3. **Экран "Смена пароля"**
   - Поля: email, код, новый пароль, подтверждение
   - Приложение → `POST /password/reset`

4. **Успешная смена**
   - Сообщение об успехе
   - Перенаправление на экран входа

## Интеграция с MyUnion

### Текущая реализация

При первом заполнении профиля (ФИО + Email):
1. Генерируется безопасный пароль
2. Создается пользователь в BestBenefits
3. Email **нельзя изменить** после первого сохранения
4. Пароль хранится зашифрованным в БД

### Код интеграции

```typescript
// app/api/profile/route.ts
if (
  process.env.USE_REAL_BB_API === "true" &&
  firstName &&
  lastName &&
  email && // Email обязателен!
  !userBeforeUpdate?.bestBenefitsUserId
) {
  // Генерируем пароль
  const bbPassword = crypto.randomBytes(12).toString("base64").slice(0, 12);
  
  // Создаем пользователя в BB
  await syncUserToBestBenefits({
    id: updatedUser.id,
    email: email,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    password: bbPassword,
    city_id: null,
  });
}
```

### Защита Email

```typescript
// Email нельзя изменить после первого сохранения
const emailToSave = userBeforeUpdate?.email ? userBeforeUpdate.email : email;

if (userBeforeUpdate?.email && email && userBeforeUpdate.email !== email) {
  console.warn("[profile] Attempt to change email - ignored");
}
```

## TODO: Будущий функционал

- [ ] Добавить экран "Забыли пароль BestBenefits?" в профиле
- [ ] Реализовать UI для сброса пароля BB через API
- [ ] Добавить возможность смены пароля BB (с текущим паролем)
- [ ] Показывать пользователю его пароль BB (после расшифровки) в профиле
- [ ] Rate limiting на стороне клиента (защита от 429)

## Безопасность

⚠️ **Важно:**
- Email в BestBenefits = Email в MyUnion (неизменяемый)
- Пароль BB хранится зашифрованным (`bestBenefitsPassword`)
- Пароль BB ≠ Пароль MyUnion
- При смене пароля BB нужно обновить `bestBenefitsPassword` в БД

## Связанные файлы

- `lib/best-benefits-users.ts` - Создание пользователей BB
- `lib/best-benefits-password.ts` - Шифрование/дешифрование паролей
- `app/api/profile/route.ts` - Синхронизация при заполнении профиля
- `BESTBENEFITS_PASSWORD_SYNC.md` - Документация по паролям

