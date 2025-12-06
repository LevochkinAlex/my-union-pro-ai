# 📱 Настройка 2FA через Telegram Bot

## 🎯 Что было реализовано

1. **Telegram Bot интеграция** для отправки PIN-кодов
2. **API endpoints** для привязки Telegram к аккаунту
3. **Webhook** для получения обновлений от Telegram
4. **UI обновления** на странице входа с поддержкой привязки Telegram

---

## 📋 Шаг 1: Создание Telegram Bot

### 1.1. Создайте бота через BotFather

1. Откройте Telegram и найдите **[@BotFather](https://t.me/BotFather)**
2. Отправьте команду: `/newbot`
3. Придумайте имя бота (например: `МойСоюз Вход`)
4. Придумайте username (например: `myunionpro_bot`)
   - Username должен заканчиваться на `_bot`
5. Скопируйте **TOKEN** (вида: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 1.2. Сохраните данные бота

Добавьте в `.env.local`:

```env
# Telegram Bot для 2FA
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME=your_bot_username
```

---

## 📋 Шаг 2: Настройка Webhook

### 2.1. Зарегистрируйте webhook в Telegram

После деплоя на продакшен (или используя ngrok для локальной разработки):

```bash
# Замените YOUR_TOKEN и YOUR_DOMAIN на свои значения
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
  -d "url=https://YOUR_DOMAIN/api/telegram/webhook"
```

**Пример:**
```bash
curl -X POST "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/setWebhook" \
  -d "url=https://myunion.pro/api/telegram/webhook"
```

### 2.2. Проверьте webhook

```bash
curl "https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo"
```

Должен вернуть:
```json
{
  "ok": true,
  "result": {
    "url": "https://myunion.pro/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## 📋 Шаг 3: Обновление базы данных

### 3.1. Примените миграцию

Новые поля в модели `User`:
- `telegramChatId` - Chat ID пользователя в Telegram (для отправки PIN-кодов)
- `telegramUsername` - Username пользователя (опционально, для справки)

```bash
pnpm prisma db push
```

---

## 🎯 Как это работает

### Процесс входа:

1. **Пользователь вводит номер телефона** на странице `/login`
2. **Система проверяет**, привязан ли Telegram к этому номеру
3. **Если не привязан:**
   - Показывается кнопка "Открыть Telegram"
   - Пользователь переходит в бота и нажимает `/start`
   - Telegram chat_id автоматически привязывается к аккаунту
4. **Если привязан:**
   - Генерируется 4-значный PIN-код
   - PIN-код отправляется в Telegram
   - Пользователь вводит код на сайте
   - Вход выполнен! ✅

### Deep Link формат:

```
https://t.me/myunionpro_bot?start=AUTH_phone_+79991234567
```

При переходе по этой ссылке:
1. Открывается Telegram бот
2. Автоматически отправляется команда `/start AUTH_phone_+79991234567`
3. Webhook получает сообщение и привязывает chat_id к номеру телефона
4. Пользователь получает приветственное сообщение

---

## 🧪 Тестирование

### 1. Проверка токена бота

```bash
curl "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/getMe"
```

Должен вернуть информацию о боте.

### 2. Тестовая отправка сообщения

```bash
curl -X POST "https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/sendMessage" \
  -d "chat_id=YOUR_CHAT_ID" \
  -d "text=Тест"
```

### 3. Получение chat_id

1. Напишите боту любое сообщение
2. Откройте в браузере:
   ```
   https://api.telegram.org/bot8321416024:AAGKjoe4tL_OCe1xysXx0sMfMf8RTMsGnlo/getUpdates
   ```
3. Найдите `chat.id` в ответе

---

## 🔧 Troubleshooting

### Ошибка: "Телеграм не привязан"

**Причина:** У пользователя нет привязанного Telegram chat_id

**Решение:**
1. Нажмите "Открыть Telegram" на странице входа
2. Нажмите `/start` в боте
3. Вернитесь на сайт и повторите попытку

### Ошибка: "TELEGRAM_BOT_TOKEN не настроен"

**Причина:** Отсутствует переменная окружения

**Решение:**
1. Добавьте `TELEGRAM_BOT_TOKEN` в `.env.local`
2. Перезапустите сервер

### PIN-код не приходит

**Проверьте:**
1. Webhook настроен правильно (`getWebhookInfo`)
2. Бот не заблокирован пользователем
3. В логах сервера нет ошибок отправки (`[2FA Auth]`)

### Webhook не работает локально

**Решение:**
1. Используйте **ngrok** для локальной разработки:
   ```bash
   ngrok http 3000
   ```
2. Установите webhook на ngrok URL:
   ```bash
   curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
     -d "url=https://YOUR_NGROK_URL/api/telegram/webhook"
   ```

---

## 🚀 Дальнейшее развитие

### TODO: Этап 2 - WhatsApp через SendPulse

- [ ] Регистрация в SendPulse
- [ ] Настройка WhatsApp Business API
- [ ] Добавить fallback на WhatsApp если Telegram не привязан
- [ ] Обновить UI для выбора канала отправки

### TODO: Этап 3 - SMS через Brevo (fallback)

- [ ] Регистрация в Brevo
- [ ] Получение API ключа
- [ ] Добавить SMS как последний fallback метод
- [ ] Приоритет: Telegram → WhatsApp → SMS

---

## 📝 API Endpoints

### `POST /api/auth/sms/send-pin`

Отправляет PIN-код через Telegram (или другой канал)

**Request:**
```json
{
  "phone": "+79991234567"
}
```

**Response (успех):**
```json
{
  "success": true,
  "deliveryMethod": "telegram",
  "message": "Код подтверждения отправлен в Telegram"
}
```

**Response (требуется привязка):**
```json
{
  "error": "Телеграм не привязан",
  "requiresTelegram": true,
  "message": "Для получения кода подтверждения необходимо привязать Telegram",
  "phone": "+79991234567"
}
```

### `POST /api/telegram/link`

Генерирует deep link для привязки Telegram

**Request:**
```json
{
  "phone": "+79991234567"
}
```

**Response:**
```json
{
  "success": true,
  "deepLink": "https://t.me/myunionpro_bot?start=AUTH_phone_+79991234567",
  "botUsername": "myunionpro_bot"
}
```

### `GET /api/telegram/link/status?phone=+79991234567`

Проверяет, привязан ли Telegram к номеру

**Response:**
```json
{
  "linked": true,
  "telegramUsername": "username"
}
```

### `POST /api/telegram/webhook`

Webhook для получения обновлений от Telegram (только для Telegram API)

---

## 📊 База данных

### Изменения в модели `User`:

```prisma
model User {
  // ... существующие поля ...
  
  // Telegram интеграция для 2FA
  telegramChatId   String? @unique
  telegramUsername String?
}
```

### Модель `SMSPinCode` (без изменений):

```prisma
model SMSPinCode {
  id        String   @id @default(cuid())
  phone     String
  hashedPin String
  expiresAt DateTime
  used      Boolean  @default(false)
  // ... остальные поля
}
```

---

## ✅ Checklist для продакшена

- [x] Создан Telegram Bot через BotFather
- [x] Токен бота добавлен в `.env.local`
- [ ] Webhook настроен на продакшен URL
- [ ] Миграция БД применена на продакшене
- [ ] Протестирован полный процесс входа
- [ ] Проверены логи на наличие ошибок

---

**Текущий статус:** ✅ Telegram Bot готов к использованию

**Следующий шаг:** Настроить webhook после деплоя на продакшен

