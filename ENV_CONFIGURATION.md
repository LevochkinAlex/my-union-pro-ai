# 🔐 Конфигурация переменных окружения

> **Важно:** Этот документ содержит описание всех переменных окружения проекта MyUnion Pro AI.  
> Реальные значения хранятся в `.env.local` (не коммитится в git).

---

## 📋 Содержание

1. [Основные настройки](#основные-настройки)
2. [База данных](#база-данных)
3. [Аутентификация NextAuth](#аутентификация-nextauth)
4. [OpenRouter AI](#openrouter-ai)
5. [DaData (проверка адресов и организаций)](#dadata-проверка-адресов-и-организаций)
6. [BestBenefits интеграция](#bestbenefits-интеграция)
7. [Email (SMTP)](#email-smtp)
8. [Push-уведомления (OneSignal)](#push-уведомления-onesignal)
9. [Firebase](#firebase)
10. [Redis](#redis)
11. [Puppeteer](#puppeteer)
12. [Прочие настройки](#прочие-настройки)

---

## Основные настройки

### `NODE_ENV`
- **Описание:** Окружение приложения
- **Значения:** `development` | `production` | `test`
- **По умолчанию:** `development`
- **Пример:** `NODE_ENV=production`

### `NEXT_PUBLIC_APP_URL`
- **Описание:** Публичный URL приложения (для ссылок в уведомлениях, email и т.д.)
- **Обязательно:** ⚠️ Да (для production)
- **По умолчанию:** `https://myunion.pro`
- **Пример:** `NEXT_PUBLIC_APP_URL=https://myunion.pro`

### `NEXT_PUBLIC_APP_VERSION`
- **Описание:** Версия приложения (отображается в сайдбаре)
- **Обязательно:** Нет
- **По умолчанию:** `1.0.0`
- **Пример:** `NEXT_PUBLIC_APP_VERSION=2.1.5`

### `NEXT_PUBLIC_CDN_URL`
- **Описание:** URL CDN для статических файлов (изображения, документы, иконки и т.д.)
- **Обязательно:** Нет (опционально для ускорения загрузки)
- **По умолчанию:** Используются прямые пути к файлам на основном домене
- **Пример:** `NEXT_PUBLIC_CDN_URL=https://cdn.myunion.pro`
- **Использование:**
  - Все загруженные файлы (посты, аватары, чат-файлы, документы) будут отдаваться через CDN
  - Статические иконки (favicon, apple-touch-icon) также отдаются через CDN
  - Если CDN не настроен, файлы отдаются напрямую с основного домена
  - CDN автоматически используется везде, где формируются URL файлов и иконок
- **Требования:**
  - CDN должен быть настроен для проксирования запросов к основному домену
  - Или файлы должны быть скопированы на CDN (Selectel Storage, S3 и т.д.)
  - Для статических иконок: файлы из `/public` должны быть доступны на CDN

---

## База данных

### `DATABASE_URL`
- **Описание:** URL подключения к PostgreSQL базе данных
- **Обязательно:** ✅ Да
- **Формат:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`
- **Пример:**
  ```bash
  DATABASE_URL="postgresql://postgres:password@localhost:5432/myunion?schema=public"
  ```

### `DIRECT_URL`
- **Описание:** Прямое подключение к БД (для миграций, если используется connection pooling)
- **Обязательно:** Нет (только при использовании PgBouncer/Prisma Accelerate)
- **Пример:**
  ```bash
  DIRECT_URL="postgresql://postgres:password@localhost:5432/myunion"
  ```

---

## Аутентификация NextAuth

### `NEXTAUTH_URL`
- **Описание:** URL для NextAuth (базовый URL приложения)
- **Обязательно:** ✅ Да
- **Пример:**
  ```bash
  NEXTAUTH_URL=http://localhost:3004
  # или для production:
  NEXTAUTH_URL=https://myunion.pro
  ```

### `NEXTAUTH_SECRET`
- **Описание:** Секретный ключ для шифрования сессий и токенов
- **Обязательно:** ✅ Да
- **Генерация:** `openssl rand -base64 32`
- **Пример:**
  ```bash
  NEXTAUTH_SECRET="ваш_сгенерированный_секретный_ключ_32_символа"
  ```

---

## OpenRouter AI

### `OPENROUTER_API_KEY`
- **Описание:** API ключ для OpenRouter (AI модели)
- **Обязательно:** ✅ Да (для работы AI чат-бота)
- **Где получить:** [openrouter.ai](https://openrouter.ai/keys)
- **Пример:**
  ```bash
  OPENROUTER_API_KEY="sk-or-v1-..."
  ```

### `OPENROUTER_MODEL`
- **Описание:** Модель AI для чата
- **Обязательно:** Нет
- **По умолчанию:** Определяется в системных настройках
- **Примеры:**
  ```bash
  OPENROUTER_MODEL="anthropic/claude-3.5-sonnet"
  OPENROUTER_MODEL="openai/gpt-4-turbo"
  OPENROUTER_MODEL="google/gemini-pro-1.5"
  ```

### `OPENROUTER_EMBEDDING_MODEL`
- **Описание:** Модель для генерации эмбеддингов (база знаний)
- **Обязательно:** Нет
- **По умолчанию:** `openai/text-embedding-3-large`
- **Пример:**
  ```bash
  OPENROUTER_EMBEDDING_MODEL="openai/text-embedding-3-large"
  ```

---

## DaData (проверка адресов и организаций)

### `DADATA_API_KEY`
- **Описание:** API токен для DaData (проверка адресов и организаций по ЕГРЮЛ/Минюст РФ)
- **Обязательно:** ⚠️ Рекомендуется (для валидации адресов и поиска организаций)
- **Где получить:** [dadata.ru](https://dadata.ru/)
- **Использование:**
  - Валидация и стандартизация адресов пользователей
  - Поиск организаций в реестре ЕГРЮЛ/Минюста РФ
  - Автозаполнение адресов
- **Пример:**
  ```bash
  DADATA_API_KEY="ваш_токен_dadata"
  ```

### `DADATA_SECRET_KEY`
- **Описание:** Секретный ключ DaData (для некоторых методов API)
- **Обязательно:** Нет
- **Пример:**
  ```bash
  DADATA_SECRET_KEY="ваш_секретный_ключ"
  ```

---

## BestBenefits интеграция

### `USE_REAL_BB_API`
- **Описание:** Использовать реальное API BestBenefits или mock данные
- **Значения:** `true` | `false`
- **По умолчанию:** `false`
- **Пример:**
  ```bash
  USE_REAL_BB_API=true
  ```

### `BEST_BENEFITS_API_URL`
- **Описание:** URL API BestBenefits
- **Обязательно:** Да (если `USE_REAL_BB_API=true`)
- **По умолчанию:** `https://bestbenefits.ru/api/products`
- **Пример:**
  ```bash
  BEST_BENEFITS_API_URL="https://bestbenefits.ru/api/products"
  ```

### `BB_LOGIN`
- **Описание:** Email для авторизации в BestBenefits API
- **Обязательно:** Да (если `USE_REAL_BB_API=true`)
- **Пример:**
  ```bash
  BB_LOGIN="admin@myunion.pro"
  ```

### `BB_PASSWORD`
- **Описание:** Пароль для авторизации в BestBenefits API
- **Обязательно:** Да (если `USE_REAL_BB_API=true`)
- **Пример:**
  ```bash
  BB_PASSWORD="secure_password_here"
  ```

### `BB_PROFSOYUZY_TOKEN`
- **Описание:** Токен профсоюза для создания пользователей в BestBenefits
- **Обязательно:** Да (если `USE_REAL_BB_API=true`)
- **Пример:**
  ```bash
  BB_PROFSOYUZY_TOKEN="ваш_токен_профсоюза"
  ```

### `BB_PASSWORD_ENCRYPTION_KEY` или `ENCRYPTION_KEY`
- **Описание:** Ключ для шифрования паролей BestBenefits (AES-256-GCM)
- **Обязательно:** ✅ Да
- **Требования:** Ровно 32 символа
- **Генерация:** `openssl rand -hex 16`
- **Пример:**
  ```bash
  BB_PASSWORD_ENCRYPTION_KEY="your-32-character-encryption-key-here!!"
  ```

---

## Email (SMTP)

### `SMTP_HOST`
- **Описание:** Хост SMTP сервера
- **Обязательно:** Да (для отправки email)
- **Пример:**
  ```bash
  SMTP_HOST="smtp.gmail.com"
  ```

### `SMTP_PORT`
- **Описание:** Порт SMTP сервера
- **Обязательно:** Да
- **Типичные значения:** `587` (TLS) или `465` (SSL)
- **Пример:**
  ```bash
  SMTP_PORT=587
  ```

### `SMTP_USER`
- **Описание:** Пользователь для SMTP авторизации
- **Обязательно:** Да
- **Пример:**
  ```bash
  SMTP_USER="noreply@myunion.pro"
  ```

### `SMTP_PASSWORD` или `SMTP_PASS`
- **Описание:** Пароль для SMTP авторизации
- **Обязательно:** Да
- **Примечание:** Для Gmail используйте App Password
- **Пример:**
  ```bash
  SMTP_PASSWORD="your_smtp_password"
  ```

### `SMTP_FROM`
- **Описание:** Email отправителя (From)
- **Обязательно:** Да
- **Пример:**
  ```bash
  SMTP_FROM="MyUnion Pro <noreply@myunion.pro>"
  ```

---

## Push-уведомления (OneSignal)

### `NEXT_PUBLIC_ONESIGNAL_APP_ID`
- **Описание:** App ID от OneSignal
- **Обязательно:** Да (для push-уведомлений)
- **Где получить:** [onesignal.com](https://onesignal.com/)
- **Пример:**
  ```bash
  NEXT_PUBLIC_ONESIGNAL_APP_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  ```

### `NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID`
- **Описание:** Safari Web ID для push-уведомлений в Safari
- **Обязательно:** Нет (только для Safari)
- **Пример:**
  ```bash
  NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID="web.onesignal.auto.xxxxxxxx"
  ```

### `ONESIGNAL_REST_API_KEY`
- **Описание:** REST API Key для серверной отправки уведомлений
- **Обязательно:** Да (для отправки уведомлений с сервера)
- **Пример:**
  ```bash
  ONESIGNAL_REST_API_KEY="ваш_rest_api_key"
  ```

---

## Google Pay Passes API

### `GOOGLE_PAY_ISSUER_ID`
- **Описание:** Issuer ID для Google Pay Passes API
- **Обязательно:** Да (для добавления скидок в Google Wallet на Android)
- **Где получить:** [Google Pay Business Console](https://pay.google.com/business/console)
- **Пример:**
  ```bash
  GOOGLE_PAY_ISSUER_ID="3388000000023063666"
  ```

### `GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL`
- **Описание:** Email Service Account для Google Pay API
- **Обязательно:** Нет (по умолчанию используется Firebase Service Account)
- **По умолчанию:** `firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com`
- **Пример:**
  ```bash
  GOOGLE_PAY_SERVICE_ACCOUNT_EMAIL="firebase-adminsdk-fbsvc@myunion-c3187.iam.gserviceaccount.com"
  ```

### `GOOGLE_PAY_PROJECT_ID`
- **Описание:** ID проекта Google Cloud
- **Обязательно:** Нет (по умолчанию используется `myunion-c3187`)
- **По умолчанию:** `myunion-c3187`
- **Пример:**
  ```bash
  GOOGLE_PAY_PROJECT_ID="myunion-c3187"
  ```

**Примечание:** Service Account ключ берется из `FIREBASE_PRIVATE_KEY`. Убедитесь, что Service Account имеет права на Google Pay Passes API.

---

## Firebase

### `FIREBASE_PROJECT_ID`
- **Описание:** ID проекта Firebase
- **Обязательно:** Да (для Firebase Cloud Messaging)
- **Пример:**
  ```bash
  FIREBASE_PROJECT_ID="myunion-xxxxx"
  ```

### `FIREBASE_CLIENT_EMAIL`
- **Описание:** Email сервисного аккаунта Firebase
- **Обязательно:** Да
- **Пример:**
  ```bash
  FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@myunion-xxxxx.iam.gserviceaccount.com"
  ```

### `FIREBASE_PRIVATE_KEY`
- **Описание:** Приватный ключ сервисного аккаунта Firebase
- **Обязательно:** Да
- **Формат:** Многострочный ключ с `\n`
- **Пример:**
  ```bash
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
  ```

### `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- **Описание:** VAPID ключ для Web Push
- **Обязательно:** Да (для push-уведомлений)
- **Где получить:** Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
- **Пример:**
  ```bash
  NEXT_PUBLIC_FIREBASE_VAPID_KEY="BKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ```

---

## Redis

### `REDIS_URL`
- **Описание:** URL подключения к Redis (для очередей и кеширования)
- **Обязательно:** Нет (опционально для фоновых задач)
- **По умолчанию:** `redis://localhost:6379`
- **Примеры:**
  ```bash
  # Локальный Redis
  REDIS_URL="redis://localhost:6379"
  
  # Redis с паролем
  REDIS_URL="redis://:password@localhost:6379"
  
  # Redis Cloud
  REDIS_URL="redis://user:password@redis-xxxxx.cloud.redislabs.com:12345"
  ```

---

## Puppeteer

### `PUPPETEER_EXECUTABLE_PATH`
- **Описание:** Путь к Chrome/Chromium для генерации PDF документов
- **Обязательно:** Нет (автоопределение)
- **Когда нужно:** В Docker/серверах без Chrome
- **Примеры:**
  ```bash
  # Linux
  PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
  
  # macOS
  PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  
  # Docker Alpine
  PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
  ```

---

## Прочие настройки

### `TEST_AUTH_COOKIE`
- **Описание:** Cookie для тестирования API (только для разработки)
- **Обязательно:** Нет
- **Использование:** Тестовые скрипты
- **Пример:**
  ```bash
  TEST_AUTH_COOKIE="next-auth.session-token=xxxxxx"
  ```

---

## 🚀 Быстрый старт

### Минимальная конфигурация для запуска

Создайте `.env.local` с минимальным набором переменных:

```bash
# === ОБЯЗАТЕЛЬНЫЕ НАСТРОЙКИ ===

# База данных
DATABASE_URL="postgresql://postgres:password@localhost:5432/myunion?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET="сгенерируйте_командой_openssl_rand_base64_32"

# OpenRouter AI
OPENROUTER_API_KEY="sk-or-v1-ваш_ключ_здесь"

# Шифрование паролей BestBenefits
BB_PASSWORD_ENCRYPTION_KEY="your-32-character-key-here-!!!!"

# === РЕКОМЕНДУЕМЫЕ НАСТРОЙКИ ===

# DaData (для проверки организаций и адресов)
DADATA_API_KEY="ваш_токен_dadata"

# Email (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="noreply@myunion.pro"
SMTP_PASSWORD="ваш_app_password"
SMTP_FROM="MyUnion Pro <noreply@myunion.pro>"
```

---

## 📝 Примечания по безопасности

1. **Никогда не коммитьте `.env.local` в Git!**
   - Файл уже в `.gitignore`
   - Храните секреты в безопасном месте (1Password, Bitwarden и т.д.)

2. **Генерация секретных ключей:**
   ```bash
   # NextAuth Secret
   openssl rand -base64 32
   
   # Encryption Key (32 символа)
   openssl rand -hex 16
   ```

3. **Production настройки:**
   - Используйте переменные окружения сервера (не файл)
   - Регулярно ротируйте секретные ключи
   - Используйте HTTPS для всех внешних API

---

## 🔄 Миграция из старой версии

Если у вас есть старый `.env` файл, скопируйте все переменные в `.env.local`:

```bash
cp .env .env.local
```

Затем проверьте что все обязательные переменные заполнены по чек-листу выше.

---

## 🐛 Диагностика проблем

### Проверка конфигурации при запуске

При `NODE_ENV=development` приложение проверяет наличие обязательных переменных и выводит предупреждения в консоль.

### Проверка DaData

Если организации не находятся в реестре Минюста РФ:
1. Убедитесь что `DADATA_API_KEY` установлен
2. Проверьте логи: `[organization-search]`
3. Проверьте лимиты на [dadata.ru](https://dadata.ru/)

### Проверка BestBenefits

Если скидки не загружаются:
1. Проверьте `USE_REAL_BB_API=true`
2. Проверьте `BB_LOGIN`, `BB_PASSWORD`, `BB_PROFSOYUZY_TOKEN`
3. Проверьте логи: `[best-benefits]`

---

## 📚 Дополнительные ресурсы

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [OpenRouter API](https://openrouter.ai/docs)
- [DaData API](https://dadata.ru/api/)
- [OneSignal Documentation](https://documentation.onesignal.com/)
- [Prisma Documentation](https://www.prisma.io/docs)

---

**Последнее обновление:** 24 ноября 2025  
**Версия документа:** 1.0

