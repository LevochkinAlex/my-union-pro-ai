# Email Verification Flow

## Общая концепция

Для надежности и безопасности, при добавлении email в профиль пользователь должен подтвердить его через письмо с уникальной ссылкой. **Аккаунт в BestBenefits создается только после подтверждения email.**

## Этапы процесса

### 1. Ввод Email в анкете

**Файл:** `components/chat/ProfileSelfFillModal.tsx`

- Пользователь вводит email в обязательное поле анкеты (справа от телефона)
- Email проходит валидацию формата
- При сохранении анкеты:
  - Email сохраняется в БД
  - Автоматически генерируется `verificationToken` (32 байта hex)
  - Устанавливается `verificationExpires` = 24 часа
  - `emailVerified` = `null` (не подтвержден)
  - Отправляется письмо с ссылкой подтверждения

### 2. Отправка письма с подтверждением

**API:** `POST /api/user/send-verification-email`

**Входные данные:**
```json
{
  "email": "user@example.com"
}
```

**Логика:**
1. Проверка авторизации пользователя
2. Валидация формата email
3. Проверка, не занят ли email другим пользователем
4. Генерация токена верификации (crypto.randomBytes)
5. Сохранение в БД:
   ```prisma
   {
     email: "user@example.com",
     emailVerified: null,
     verificationToken: "abc123...",
     verificationExpires: new Date(Date.now() + 24h)
   }
   ```
6. Формирование ссылки: `https://myunion.pro/verify-email?token=abc123...`
7. Отправка HTML письма через `sendEmail()`

**Шаблон письма:**
- Приветствие с именем пользователя
- Кнопка "Подтвердить email"
- Текстовая ссылка для копирования
- Срок действия (24 часа)
- Примечание: "Если вы не регистрировались, проигнорируйте письмо"

### 3. Подтверждение Email

**Страница:** `app/verify-email/page.tsx`

Пользователь переходит по ссылке из письма → автоматический редирект на страницу верификации.

**API:** `POST /api/user/verify-email`

**Входные данные:**
```json
{
  "token": "abc123..."
}
```

**Логика:**
1. Поиск пользователя по `verificationToken`
2. Проверка срока действия (`verificationExpires > now`)
3. Проверка, не подтвержден ли уже email
4. Обновление БД:
   ```prisma
   {
     emailVerified: new Date(),
     verificationToken: null,
     verificationExpires: null
   }
   ```
5. **СОЗДАНИЕ АККАУНТА В BESTBENEFITS** (только если email подтвержден):
   - Проверка условий: ФИО заполнено + email подтвержден + еще не синхронизирован
   - Генерация безопасного пароля (12 символов)
   - Вызов `syncUserToBestBenefits()`
   - Шифрование пароля и сохранение в БД
   - Сохранение `bestBenefitsUserId`, `bestBenefitsStatus`, `bestBenefitsCreatedAt`

**Ответ:**
```json
{
  "success": true,
  "message": "Email успешно подтвержден"
}
```

### 4. UI отображение статуса

**Статусы в анкете:**

```typescript
// ✅ Email подтвержден
if (emailVerified) {
  badge: "✓ Подтвержден" (зеленый)
  input: disabled = false
  кнопка: скрыта
}

// ⚠️ Email ожидает подтверждения
if (!emailVerified && email === originalEmail) {
  badge: "⚠ Ожидает подтверждения" (оранжевый)
  input: disabled = false
  кнопка: "Отправить повторно" (видима)
  hint: "Проверьте почту для подтверждения"
}

// 🆕 Email только что введен/изменен
if (!emailVerified && email !== originalEmail) {
  badge: скрыт
  input: disabled = false
  кнопка: скрыта
  hint: скрыт
}
```

### 5. Повторная отправка письма

Если пользователь не получил письмо:
- Кнопка "Отправить повторно" → вызов `POST /api/user/send-verification-email`
- Генерируется новый токен (старый становится недействительным)
- Новое письмо отправляется на тот же email

## Безопасность

1. **Токен одноразовый**: После использования удаляется из БД
2. **Ограничение по времени**: 24 часа с момента генерации
3. **Защита от изменения**: Email нельзя изменить после первого подтверждения (используется для BestBenefits)
4. **Шифрование пароля BB**: Пароль BestBenefits хранится в зашифрованном виде

## Схема БД

```prisma
model User {
  // ...
  email               String?    @unique
  emailVerified       DateTime?  // NULL = не подтвержден
  verificationToken   String?    @unique
  verificationExpires DateTime?
  
  // BestBenefits (создается после emailVerified)
  bestBenefitsUserId       String?
  bestBenefitsPassword     String?  // Зашифрован
  bestBenefitsStatus       String?
  bestBenefitsCreatedAt    DateTime?
  
  @@index([verificationToken])
}
```

## Важные моменты

### ❌ СТАРАЯ ЛОГИКА (удалена)
- `app/api/profile/route.ts` больше НЕ создает BB аккаунт при сохранении email
- Весь блок `syncUserToBestBenefits` перенесен в `/api/user/verify-email`

### ✅ НОВАЯ ЛОГИКА
- BB аккаунт создается **ТОЛЬКО** в `/api/user/verify-email` **ПОСЛЕ** подтверждения
- Email **обязателен** для создания BB аккаунта
- Пароль генерируется автоматически и **нельзя изменить вручную**

## Сценарии использования

### Сценарий 1: Новый пользователь
1. Заполняет анкету, вводит email
2. Нажимает "Сохранить"
3. Видит badge "⚠ Ожидает подтверждения"
4. Получает письмо
5. Переходит по ссылке
6. Email подтверждается → создается BB аккаунт
7. Badge меняется на "✓ Подтвержден"
8. Доступ к скидкам BestBenefits активирован

### Сценарий 2: Не получил письмо
1. Email в статусе "⚠ Ожидает подтверждения"
2. Нажимает "Отправить повторно"
3. Получает новое письмо с новым токеном
4. Подтверждает email

### Сценарий 3: Истек срок действия
1. Переходит по ссылке через 25+ часов
2. Видит ошибку "Неверный или истекший токен"
3. Возвращается в личный кабинет
4. Нажимает "Отправить повторно"

## Интеграция с BestBenefits

**Условия для создания аккаунта BB:**
```typescript
if (
  emailVerified && // ✅ Email подтвержден
  firstName && lastName && // ✅ ФИО заполнено
  !bestBenefitsUserId // ✅ Еще не синхронизирован
) {
  // Создаем аккаунт в BB
}
```

**Параметры синхронизации:**
```typescript
syncUserToBestBenefits({
  id: user.id,
  email: user.email, // Подтвержденный email
  firstName: user.firstName,
  lastName: user.lastName,
  password: generatedPassword, // 12 символов, base64
  city_id: null, // Опционально
})
```

## Тестирование

### Проверка работы
1. Заполните анкету с email
2. Проверьте логи: `[Email] Готово к отправке`
3. Скопируйте токен из логов
4. Перейдите: `http://localhost:3004/verify-email?token=ТОКЕН`
5. Проверьте БД: `emailVerified` должен быть установлен
6. Проверьте логи: `[verify-email] User synced to BestBenefits`

### Mock email (для тестирования без SMTP)
В `lib/email.ts` функция `sendEmail()` пока только логирует:
```typescript
console.log("[Email] ⚠️ ВНИМАНИЕ: Email НЕ отправлен");
console.log("[Email] HTML preview:", options.html);
```

Для production нужно настроить SMTP или SendGrid.

## TODO для production

- [ ] Настроить SendGrid API key
- [ ] Добавить rate limiting для отправки писем
- [ ] Добавить капчу для защиты от спама
- [ ] Настроить email шаблоны через сервис (опционально)
- [ ] Добавить мониторинг доставки писем
- [ ] Настроить SPF/DKIM/DMARC для домена

