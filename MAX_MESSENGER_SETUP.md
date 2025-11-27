# 📱 Настройка MAX Messenger для 2FA

## 🎯 Что это?

MAX Messenger — это российский мессенджер с Bot API, который можно использовать для отправки 2FA PIN-кодов. Мы интегрировали MAX как альтернативный канал доставки (приоритет 2 после Telegram).

**Официальная документация**: https://github.com/max-messenger/max-bot-api-client-ts

---

## 📋 Приоритет доставки PIN-кодов

1. **Telegram** (если привязан)
2. **MAX Messenger** (если привязан)  
3. **WhatsApp** (через Facebook Cloud API)

---

## 🔧 Настройка MAX Bot

### Шаг 1: Создание бота

1. Откройте MAX Messenger
2. Найдите **Master Bot** (@master)
3. Отправьте команду `/newbot`
4. Следуйте инструкциям Master Bot:
   - Введите имя бота (например: `МойСоюз Бот`)
   - Введите username бота (например: `myunion_auth_bot`)

### Шаг 2: Получение токена

После создания бота Master Bot отправит вам **Bot Token**. Скопируйте его.

Пример токена:
```
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789
```

### Шаг 3: Настройка Webhook

Webhook URL для вашего приложения:
```
https://myunion.pro/api/max/webhook
```

Чтобы установить webhook, отправьте Master Bot команду:
```
/setwebhook
```

И укажите URL:
```
https://myunion.pro/api/max/webhook
```

---

## 🔐 Переменные окружения

Добавьте в `.env.local` (локально) и на сервере:

```bash
# MAX Messenger Bot
MAX_BOT_TOKEN=your_bot_token_here
```

---

## 🚀 Деплой на VDS

### 1. Подключитесь к серверу

```bash
ssh root@194.87.49.210
```

### 2. Перейдите в директорию проекта

```bash
cd /opt/my-union-pro
```

### 3. Подтяните последние изменения

```bash
git pull origin main
```

### 4. Установите зависимости

```bash
pnpm install
# или npm install
```

### 5. Добавьте переменные окружения

```bash
nano .env.local
```

Добавьте:
```
MAX_BOT_TOKEN=your_bot_token_here
```

Сохраните (Ctrl+X, Y, Enter)

### 6. Обновите схему БД

```bash
npx prisma db push --accept-data-loss
```

### 7. Пересоберите проект

```bash
pnpm build
# или npm run build
```

### 8. Перезапустите приложение

```bash
pm2 restart my-union-pro
```

### 9. Проверьте логи

```bash
pm2 logs my-union-pro --lines 100
```

---

## 🔗 Привязка MAX к аккаунту

### Автоматическая привязка (при старте бота)

1. Пользователь заходит в MAX Messenger
2. Находит вашего бота (по username)
3. Нажимает "Начать" / "Start"
4. Если номер телефона пользователя в MAX совпадает с номером в МойСоюз:
   - MAX автоматически привязывается
   - Пользователь получает приветственное сообщение

### Ручная привязка (через API)

Если автоматическая привязка не работает, можно использовать API:

**POST** `/api/max/link`

```json
{
  "chatId": "123456789"
}
```

**Заголовки:**
- `Authorization: Bearer <session_token>`

**Ответ:**
```json
{
  "success": true,
  "message": "MAX успешно привязан"
}
```

---

## 🧪 Тестирование

### 1. Проверка токена бота

Создайте скрипт `scripts/test-max-bot.mjs`:

```javascript
const MAX_BOT_TOKEN = "YOUR_BOT_TOKEN";
const MAX_API_BASE = "https://bot.max.ru/api";

async function testMaxBot() {
  try {
    const response = await fetch(`${MAX_API_BASE}/getMe`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${MAX_BOT_TOKEN}`,
      },
    });

    const data = await response.json();
    console.log("MAX Bot Info:", JSON.stringify(data, null, 2));

    if (data.ok) {
      console.log("✅ Токен работает!");
      console.log("Имя бота:", data.result.first_name);
      console.log("Username:", data.result.username);
    } else {
      console.error("❌ Ошибка:", data.description);
    }
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
  }
}

testMaxBot();
```

Запустите:
```bash
node scripts/test-max-bot.mjs
```

### 2. Тестовая отправка сообщения

```javascript
const MAX_BOT_TOKEN = "YOUR_BOT_TOKEN";
const MAX_API_BASE = "https://bot.max.ru/api";
const CHAT_ID = "YOUR_CHAT_ID"; // Chat ID пользователя

async function sendTestMessage() {
  try {
    const response = await fetch(`${MAX_API_BASE}/sendMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MAX_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: "🔐 Тестовое сообщение от МойСоюз",
      }),
    });

    const data = await response.json();
    console.log("Ответ:", JSON.stringify(data, null, 2));

    if (data.ok) {
      console.log("✅ Сообщение отправлено!");
    } else {
      console.error("❌ Ошибка:", data.description);
    }
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
  }
}

sendTestMessage();
```

### 3. Проверка Webhook

```bash
curl https://myunion.pro/api/max/webhook
```

Ответ:
```json
{
  "status": "ok",
  "message": "MAX Webhook is running"
}
```

---

## 📊 Как это работает

### Процесс отправки PIN-кода

1. Пользователь вводит номер телефона
2. Система генерирует 4-значный PIN-код
3. Система ищет пользователя по номеру телефона
4. **Приоритет 1:** Если у пользователя привязан Telegram → отправка через Telegram
5. **Приоритет 2:** Если Telegram не привязан, но привязан MAX → отправка через MAX
6. **Приоритет 3:** Если мессенджеры не привязаны → отправка через WhatsApp

### Webhook события

MAX Bot отправляет webhook на `/api/max/webhook` при следующих событиях:

- `bot_started` - пользователь начал диалог с ботом
- `message_created` - новое сообщение от пользователя

При событии `bot_started` система:
1. Извлекает `chat_id` и `phone` пользователя
2. Ищет пользователя в БД по номеру телефона
3. Привязывает `maxChatId` к аккаунту
4. Отправляет приветственное сообщение

---

## 🗄️ Структура БД

### Обновления в схеме `User`:

```prisma
model User {
  // ...
  
  // MAX Messenger интеграция для 2FA
  maxChatId   String? @unique // Chat ID пользователя в MAX
  maxUsername String?         // Username пользователя в MAX
  
  // ...
}
```

---

## 🔍 Отладка

### Логи на сервере

```bash
# Логи PM2
pm2 logs my-union-pro --lines 100

# Поиск ошибок MAX
pm2 logs my-union-pro | grep "MAX"

# Поиск ошибок 2FA
pm2 logs my-union-pro | grep "2FA"
```

### Логи в браузере

Откройте DevTools (F12) → Console и проверьте:
- `[Login]` - логи с фронтенда
- `[2FA Auth]` - логи с бэкенда при отправке PIN
- `[MAX Messenger]` - логи интеграции с MAX
- `[MAX Webhook]` - логи webhook

### Частые проблемы

#### 1. "MAX Bot Token не настроен"

**Причина:** Переменная `MAX_BOT_TOKEN` отсутствует в `.env.local`

**Решение:**
```bash
echo 'MAX_BOT_TOKEN=your_token_here' >> .env.local
pm2 restart my-union-pro
```

#### 2. "Failed to send PIN via MAX"

**Причина:** 
- Неверный Chat ID
- Пользователь не начал диалог с ботом
- Бот заблокирован пользователем

**Решение:**
1. Проверьте, что пользователь начал диалог с ботом
2. Проверьте Chat ID в БД:
```sql
SELECT maxChatId, maxUsername FROM User WHERE phone = '+79874157897';
```

#### 3. "Webhook не работает"

**Причина:**
- Webhook не настроен в Master Bot
- URL недоступен из интернета

**Решение:**
1. Проверьте доступность:
```bash
curl -I https://myunion.pro/api/max/webhook
```
2. Переустановите webhook в Master Bot:
```
/setwebhook
https://myunion.pro/api/max/webhook
```

---

## 📦 Зависимости

Добавлены в `package.json`:

```json
{
  "dependencies": {
    "@maxhub/max-bot-api": "^1.0.0"
  }
}
```

---

## 🎨 UI/UX

### Отображение канала доставки

После отправки PIN-кода пользователь видит:

- ✅ **Telegram**: "Код подтверждения отправлен в Telegram 📱"
- ✅ **MAX**: "Код подтверждения отправлен в MAX 💬"
- ✅ **WhatsApp**: "Код подтверждения отправлен в WhatsApp 📲"

### Сообщение с PIN-кодом

```
🔐 Код для входа в МойСоюз

Ваш код подтверждения: 1234

⏱ Код действителен 5 минут
⚠️ Никому не сообщайте этот код
```

---

## 🔒 Безопасность

1. **Токен бота** хранится в `.env.local` и не коммитится в репозиторий
2. **PIN-коды** хешируются с помощью bcrypt перед сохранением в БД
3. **Webhook** проверяет подлинность запросов от MAX API
4. **Время жизни PIN** ограничено 5 минутами

---

## 📝 Итоги

✅ MAX Messenger интегрирован как приоритет 2 для 2FA  
✅ Webhook настроен для автоматической привязки  
✅ API endpoints созданы для ручной привязки  
✅ UI обновлен для отображения MAX как канала доставки  
✅ Детальное логирование для отладки  

**Следующие шаги:**
1. Получить токен бота от Master Bot
2. Добавить `MAX_BOT_TOKEN` в `.env.local`
3. Настроить webhook в Master Bot
4. Задеплоить на VDS
5. Протестировать отправку PIN-кодов

