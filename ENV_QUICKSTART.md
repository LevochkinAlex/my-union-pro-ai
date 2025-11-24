# 🚀 Быстрый старт - Настройка окружения

> **Краткая шпаргалка по настройке `.env.local`**  
> Полная документация: [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md)

---

## ⚡ Минимальная конфигурация (5 минут)

Создайте `.env.local` со следующими обязательными переменными:

```bash
# === 1. База данных ===
DATABASE_URL="postgresql://postgres:password@localhost:5432/myunion?schema=public"

# === 2. Аутентификация ===
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET="сгенерируйте_ниже"

# === 3. AI Чат-бот ===
OPENROUTER_API_KEY="получите_на_openrouter.ai"

# === 4. Шифрование ===
BB_PASSWORD_ENCRYPTION_KEY="ровно_32_символа_сгенерируйте_ниже"
```

### 🔑 Генерация секретных ключей

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# BB_PASSWORD_ENCRYPTION_KEY (ровно 32 символа)
openssl rand -hex 16
```

---

## 🎯 Полная конфигурация с рекомендуемыми сервисами

### Обязательные сервисы

| Сервис | Переменная | Где получить |
|--------|-----------|--------------|
| **PostgreSQL** | `DATABASE_URL` | Локально или [supabase.com](https://supabase.com/) |
| **OpenRouter** | `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **NextAuth** | `NEXTAUTH_SECRET` | Сгенерировать: `openssl rand -base64 32` |

### Рекомендуемые сервисы

| Сервис | Переменная | Зачем нужен |
|--------|-----------|-------------|
| **DaData** | `DADATA_API_KEY` | ✅ Проверка организаций по ЕГРЮЛ/Минюст РФ<br>✅ Валидация адресов |
| **SMTP** | `SMTP_*` | 📧 Отправка email (регистрация, сброс пароля) |
| **OneSignal** | `ONESIGNAL_*` | 🔔 Push-уведомления |
| **Firebase** | `FIREBASE_*` | 🔥 Cloud Messaging (альтернатива OneSignal) |

---

## 📋 Шаблон `.env.local`

Скопируйте и заполните своими значениями:

```bash
# ============================================
# ОБЯЗАТЕЛЬНЫЕ
# ============================================

DATABASE_URL="postgresql://postgres:password@localhost:5432/myunion?schema=public"
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET=""
OPENROUTER_API_KEY=""
BB_PASSWORD_ENCRYPTION_KEY=""

# ============================================
# DADATA - Проверка организаций и адресов
# ============================================

DADATA_API_KEY=""

# ============================================
# EMAIL (SMTP)
# ============================================

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM="MyUnion Pro <noreply@myunion.pro>"

# ============================================
# BESTBENEFITS (скидки)
# ============================================

USE_REAL_BB_API="false"
BEST_BENEFITS_API_URL="https://bestbenefits.ru/api/products"
BB_LOGIN=""
BB_PASSWORD=""
BB_PROFSOYUZY_TOKEN=""

# ============================================
# PUSH-УВЕДОМЛЕНИЯ
# ============================================

# OneSignal
NEXT_PUBLIC_ONESIGNAL_APP_ID=""
ONESIGNAL_REST_API_KEY=""

# Firebase
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""
NEXT_PUBLIC_FIREBASE_VAPID_KEY=""

# ============================================
# ПРОЧИЕ
# ============================================

NEXT_PUBLIC_APP_URL="http://localhost:3004"
NODE_ENV="development"
```

---

## 🎓 Пошаговая настройка для новичков

### Шаг 1: База данных PostgreSQL

**Вариант А: Локально (Docker)**

```bash
docker run --name myunion-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:16

# .env.local
DATABASE_URL="postgresql://postgres:password@localhost:5432/myunion?schema=public"
```

**Вариант Б: Supabase (бесплатно)**

1. Зарегистрируйтесь на [supabase.com](https://supabase.com/)
2. Создайте проект
3. Скопируйте Connection String (Pooling) из Settings → Database
4. Вставьте в `.env.local` как `DATABASE_URL`

---

### Шаг 2: OpenRouter (AI)

1. Зарегистрируйтесь на [openrouter.ai](https://openrouter.ai/)
2. Перейдите в [Keys](https://openrouter.ai/keys)
3. Создайте новый ключ
4. Добавьте в `.env.local`:
   ```bash
   OPENROUTER_API_KEY="sk-or-v1-xxxxxxxxxx"
   ```

---

### Шаг 3: DaData (проверка организаций) ⚠️ ВАЖНО!

**Без этого организации не будут проверяться по реестру Минюста РФ!**

1. Зарегистрируйтесь на [dadata.ru](https://dadata.ru/)
2. Бесплатный тариф: 10,000 запросов в день
3. Скопируйте API токен
4. Добавьте в `.env.local`:
   ```bash
   DADATA_API_KEY="ваш_токен"
   ```

**Что даёт DaData:**
- ✅ Поиск организаций по реестру ЕГРЮЛ/Минюст РФ
- ✅ Валидация и стандартизация адресов
- ✅ Автозаполнение адресов для пользователей

---

### Шаг 4: Email (SMTP)

**Вариант А: Gmail**

1. Включите 2FA в аккаунте Google
2. Создайте [App Password](https://myaccount.google.com/apppasswords)
3. Добавьте в `.env.local`:
   ```bash
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_USER="ваш@gmail.com"
   SMTP_PASSWORD="ваш_app_password"
   SMTP_FROM="MyUnion Pro <ваш@gmail.com>"
   ```

**Вариант Б: Другие провайдеры**
- [Mailgun](https://www.mailgun.com/) - 5000 писем/месяц бесплатно
- [SendGrid](https://sendgrid.com/) - 100 писем/день бесплатно
- [Amazon SES](https://aws.amazon.com/ses/) - 62,000 писем/месяц бесплатно

---

### Шаг 5: Генерация секретов

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# BB_PASSWORD_ENCRYPTION_KEY (должен быть ровно 32 символа)
openssl rand -hex 16

# Добавьте в .env.local
NEXTAUTH_SECRET="результат_первой_команды"
BB_PASSWORD_ENCRYPTION_KEY="результат_второй_команды"
```

---

## ✅ Проверка конфигурации

После настройки запустите:

```bash
npm run dev
```

Проверьте консоль на предупреждения:

- ✅ `[organization-search] DaData API configured` - DaData работает
- ❌ `[organization-search] DaData API key not configured` - нужен ключ DaData
- ✅ База данных подключена
- ✅ NextAuth инициализирован

---

## 🐛 Частые проблемы

### Организации не находятся в реестре Минюста

**Проблема:** Бот принимает любое название организации без проверки

**Решение:**
1. Проверьте что `DADATA_API_KEY` установлен в `.env.local`
2. Перезапустите сервер: `npm run dev`
3. Проверьте логи: ищите `[organization-search]`
4. Убедитесь что не исчерпан лимит запросов на dadata.ru

### Database connection failed

**Проблема:** `Error: Can't reach database server`

**Решение:**
1. Проверьте что PostgreSQL запущен: `docker ps` или `brew services list`
2. Проверьте правильность `DATABASE_URL`
3. Попробуйте подключиться вручную:
   ```bash
   psql "postgresql://postgres:password@localhost:5432/myunion"
   ```

### NextAuth: [next-auth][error][NO_SECRET]

**Проблема:** Не установлен `NEXTAUTH_SECRET`

**Решение:**
```bash
# Сгенерируйте секрет
openssl rand -base64 32

# Добавьте в .env.local
NEXTAUTH_SECRET="сгенерированный_ключ"
```

---

## 🔒 Безопасность

### ⚠️ Что НИКОГДА не коммитить в Git:

- ❌ `.env.local` - содержит секреты
- ❌ `.env` - может содержать production секреты
- ✅ `.env.example` - можно (шаблон без реальных значений)

### 🔐 Где хранить секреты:

- **Локальная разработка:** `.env.local`
- **Production:** Переменные окружения сервера (не файл!)
- **Бэкап секретов:** 1Password, Bitwarden, Vault

---

## 📚 Дополнительная информация

- **Полная документация:** [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md)
- **Документация по DaData:** [dadata.ru/api](https://dadata.ru/api/)
- **Документация NextAuth:** [next-auth.js.org](https://next-auth.js.org/)
- **Документация OpenRouter:** [openrouter.ai/docs](https://openrouter.ai/docs)

---

**Последнее обновление:** 24 ноября 2025  
**Автор:** MyUnion Pro AI Team

