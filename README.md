# МойСоюз (myunion.pro)

Платформа для управления профсоюзными организациями. Регистрация членов, документооборот, заседания, корпоративный чат, новости, скидки, ИИ-ассистент.

**Прод:** https://myunion.pro  
**Стек:** Next.js 16 · React 19 · TypeScript · Prisma · PostgreSQL · Socket.IO · Redis · Tailwind CSS

---

## Быстрый старт (локально)

### Требования

- **Node.js** 20+
- **pnpm** (`npm install -g pnpm`)
- **Git**

### Установка

```bash
# 1. Клонировать репозиторий
git clone https://github.com/myunion-pro/my-union-pro-ai.git
cd my-union-pro-ai

# 2. Установить зависимости
pnpm install

# 3. Настроить переменные окружения
cp .env.example .env.local
```

Заполни `.env.local` (попроси у тимлида):

```env
DATABASE_URL="postgresql://user:password@83.166.237.161:5432/myunion_db"
NEXTAUTH_URL="http://localhost:3004"
NEXTAUTH_SECRET="your-random-secret-32-chars"

# Опционально (для полной функциональности):
TELEGRAM_BOT_TOKEN="..."
VK_ID_CLIENT_ID="..."
YANDEX_CLIENT_ID="..."
YANDEX_CLIENT_SECRET="..."
# Yandex Cloud AI Studio — основной ИИ-провайдер
YANDEX_AI_STUDIO_API_KEY="AQVN..."
YANDEX_CLOUD_FOLDER_ID="b1g..."
REDIS_URL="redis://localhost:6379"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3005"
```

```bash
# 4. Сгенерировать Prisma Client
pnpm prisma:generate

# 5. (Опционально) Redis — кэш и фоновые очереди; без него приложение работает, но в логах будут попытки подключения к localhost:6379.
#    Либо запустите: brew install redis && redis-server
#    Либо отключите явно в .env.local строкой: REDIS_URL=

# 6. Запустить
pnpm dev
```

Открыть http://localhost:3004

Если `pnpm` не найден в PATH: `corepack enable` или `npx pnpm install` / `npx pnpm dev`.

---

## Mobile (React Native / Expo)

В репозитории добавлен отдельный мобильный клиент: `mobile/`.

```bash
cd mobile
npm install
npm run start
```

По умолчанию мобильный клиент ожидает:

- API: `http://localhost:3004`
- Socket: `http://localhost:3005`

Настройки заданы в `mobile/app.json` (`expo.extra`).

---

## Команды

| Команда | Описание |
|---------|----------|
| `pnpm dev` | Dev-сервер (порт 3004) |
| `pnpm build` | Продакшн-сборка |
| `pnpm test` | Запуск тестов |
| `pnpm type-check` | Проверка TypeScript |
| `pnpm lint` | ESLint |
| `pnpm prisma:studio` | Визуальный редактор БД (порт 5555) |
| `pnpm prisma:migrate` | Создать миграцию БД |
| `pnpm prisma:generate` | Обновить Prisma Client |
| `pnpm prisma:push` | Применить схему без миграции |

---

## Структура проекта

```
├── app/                    # Next.js App Router
│   ├── (auth)/             #   Авторизация (login, register)
│   ├── admin/              #   Админ-панель
│   ├── api/                #   API-маршруты (~270 endpoints)
│   │   ├── auth/           #     SMS, VK, Яндекс, Telegram, MAX, ЕСИА
│   │   ├── chat/           #     Чаты, сообщения, участники
│   │   ├── documents/      #     Генерация и управление документами
│   │   ├── news/           #     Новости, лайки, комментарии
│   │   ├── ppo-head/       #     API председателя ППО
│   │   ├── admin/          #     API админки
│   │   └── tickets/        #     Обращения (тикеты)
│   ├── auth/               #   Callback-страницы OAuth
│   └── dashboard/          #   Личный кабинет
│       ├── profile/        #     Профиль, анкета
│       ├── documents/      #     Документы, заседания
│       ├── chat/           #     Корпоративный чат
│       ├── news/           #     Новости
│       ├── members/        #     Управление членами (PPO_HEAD)
│       └── reports/        #     Отчётность
│
├── components/             # React-компоненты
├── lib/                    # Бизнес-логика и утилиты
│   ├── auth.ts             #   NextAuth конфигурация
│   ├── prisma.ts           #   Prisma Client
│   ├── telegram-bot.ts     #   Telegram Bot API
│   ├── vk-id-auth.ts       #   VK ID OAuth 2.1 + PKCE
│   ├── notifications.ts    #   Push/email/telegram уведомления
│   └── staff-permissions.ts #  Проверка прав сотрудников
│
├── prisma/
│   ├── schema.prisma       # Схема БД (74 модели)
│   └── migrations/         # Миграции
│
├── server/
│   └── chat-server.ts      # WebSocket-сервер (Socket.IO)
│
├── hooks/                  # React-хуки (useSocket, useChat)
├── __tests__/              # Тесты
├── scripts/                # Скрипты деплоя и утилиты
└── docs/                   # Документация
```

---

## База данных

**PostgreSQL** на VK Cloud (`83.166.237.161:5432`, база `myunion_db`).  
ORM: **Prisma** — схема в `prisma/schema.prisma`.

### Основные модели

| Модель | Описание |
|--------|----------|
| `User` | Пользователи: ФИО, телефон, email, роль, привязки к VK/Яндекс/Telegram/MAX/ЕСИА |
| `Organization` | Профсоюзные организации (ППО → МПО → РПО, иерархия) |
| `Document` | Документы: заявления, протоколы, выписки (статусы, workflow) |
| `Chat` / `ChatMessage` | Чаты и сообщения (личные, групповые, каналы) |
| `Meeting` | Заседания профкома (повестка, голосование, протоколы) |
| `Ticket` | Обращения членов профсоюза |
| `NewsPost` / `NewsChannel` | Новости с лайками, комментариями, опросами |
| `ChatBot` / `KnowledgeBase` | ИИ-ассистент с базами знаний (RAG) |
| `Discount` | Скидки и привилегии (синхронизация с BestBenefits) |
| `Report` / `ReportTemplate` | Отчётность (ежемесячная, квартальная, годовая) |
| `OrganizationStaff` / `StaffRole` | Сотрудники и должности с правами доступа |

---

## Авторизация

10 методов входа (NextAuth 4):

| Метод | Файлы |
|-------|-------|
| SMS (PIN-код) | `lib/auth.ts` (provider `sms`) |
| Email (magic link / PIN) | `app/api/auth/email/` |
| VK ID (OAuth 2.1 + PKCE) | `lib/vk-id-auth.ts`, `app/api/auth/vk-id/` |
| Яндекс | `lib/auth.ts` (YandexProvider) |
| Telegram | `app/api/auth/telegram/`, `lib/telegram-bot.ts` |
| MAX (мини-приложение) | `app/api/auth/max/` |
| ЕСИА / Госуслуги | `app/api/auth/esia/` |
| Email + пароль | `lib/auth.ts` (provider `email-password`) |
| Impersonation | `lib/auth.ts` (provider `impersonate`) |
| Демо-режим | `lib/auth.ts` (provider `demo`) |

---

## Роли

| Роль | Описание |
|------|----------|
| `PENDING_MEMBER` | Новый пользователь, заполняет анкету |
| `MEMBER` | Член профсоюза |
| `PPO_HEAD` | Председатель ППО |
| `REGIONAL_CHAIRMAN` | Председатель РПО |
| `FEDERAL_CHAIRMAN` | Федеральный председатель |
| `SUPER_ADMIN` | Супер-админ (полный доступ) |

---

## Инфраструктура и деплой

### Сервер

| Параметр | Значение |
|----------|---------|
| IP | `79.143.29.66` |
| ОС | Ubuntu 24.04 |
| Путь | `/opt/my-union-pro` |
| Процессы | PM2: `my-union-pro` (порт 3000), `my-union-socket` (порт 3005) |
| Веб-сервер | Nginx (SSL, реверс-прокси) |
| БД | PostgreSQL на VK Cloud |
| Кэш | Redis (localhost:6379) |

### Исходный код

Единственный источник кода: **GitHub** — организация [myunion-pro](https://github.com/myunion-pro), репозиторий **`my-union-pro-ai`** (приватный), `https://github.com/myunion-pro/my-union-pro-ai.git`.  
Полный чеклист деплоя, VDS и настройка `git`/`gh`: **`DEPLOY-CHECKLIST.md`**.

### Деплой

```bash
./deploy.sh           # fetch + build + pm2 restart на VDS
./deploy.sh --push    # сначала git push origin main, затем как выше
```

Детали и troubleshooting: **[DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md)**.

### Мониторинг

```bash
# Статус процессов
ssh root@79.143.29.66 'pm2 list'

# Логи
ssh root@79.143.29.66 'pm2 logs my-union-pro --lines 50 --nostream'

# Ошибки
ssh root@79.143.29.66 'pm2 logs my-union-pro --err --lines 20 --nostream'

# Полная проверка
./check-deploy-status.sh
```

---

## Развёртывание на новом сервере

### 1. Подготовка сервера

```bash
# Подключиться к серверу (текущий прод — см. таблицу выше)
ssh root@79.143.29.66

# Обновить систему
apt update && apt upgrade -y

# Установить Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Установить pnpm
npm install -g pnpm

# Установить PM2
npm install -g pm2

# Установить Nginx
apt install -y nginx

# Установить Redis
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Установить sshpass (для деплой-скриптов)
apt install -y sshpass

# Установить Chrome (для Puppeteer — генерация PDF)
apt install -y chromium-browser
# или:
bash scripts/server-install-chrome.sh
```

### 2. Клонирование проекта

```bash
cd /opt
git clone https://github.com/myunion-pro/my-union-pro-ai.git my-union-pro
cd my-union-pro
pnpm install
```

### 3. Настройка переменных окружения

```bash
nano .env.local
```

Минимальный набор:

```env
DATABASE_URL="postgresql://user:password@DB_HOST:5432/myunion_db"
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="сгенерируй-случайную-строку-32-символа"
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
NEXT_PUBLIC_SOCKET_URL="https://yourdomain.com"

TELEGRAM_BOT_TOKEN="токен-бота"
VK_ID_CLIENT_ID="id-приложения-vk"
YANDEX_CLIENT_ID="id-приложения-яндекс"
YANDEX_CLIENT_SECRET="секрет-яндекс"

REDIS_URL="redis://localhost:6379"

# SMTP для отправки email
SMTP_HOST="smtp.yandex.ru"
SMTP_PORT="465"
SMTP_USER="your@email.com"
SMTP_PASSWORD="пароль"

# Firebase для push-уведомлений (JSON service account)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'

# Yandex Cloud AI Studio — основной ИИ-провайдер (чаты, ассистент, генерация)
YANDEX_AI_STUDIO_API_KEY="AQVN..."
YANDEX_CLOUD_FOLDER_ID="b1g..."
# Опционально: модель по умолчанию (yandexgpt, yandexgpt-lite, yandexgpt-32k)
YANDEX_DEFAULT_MODEL="yandexgpt"
```

### 4. БД: миграции

```bash
# Сгенерировать Prisma Client
pnpm prisma:generate

# Применить все миграции
npx prisma migrate deploy

# Загрузить справочники (должности, профессии)
npx tsx prisma/seed-dictionaries.ts
```

### 5. Сборка

```bash
pnpm build
```

### 6. PM2: запуск процессов

```bash
# Приложение Next.js
pm2 start "pnpm start" --name my-union-pro

# WebSocket-сервер (чат)
pm2 start "pnpm socket" --name my-union-socket

# Сохранить конфигурацию (автозапуск при перезагрузке)
pm2 save
pm2 startup
```

### 7. Nginx: настройка домена

```nginx
# /etc/nginx/sites-available/myunion
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 50M;

    # Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Статические файлы (загрузки)
    location /uploads/ {
        alias /opt/my-union-pro/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Активировать конфиг
ln -s /etc/nginx/sites-available/myunion /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL (Let's Encrypt)
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

### 8. Telegram Webhook

```bash
# Зарегистрировать webhook для бота
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourdomain.com/api/telegram/webhook"}'
```

### 9. Проверка

```bash
pm2 list                     # Оба процесса online
curl -s https://yourdomain.com/api/health   # 200 OK
pm2 logs my-union-pro --lines 20            # Нет ошибок
```

---

## Тестирование

```bash
# Все тесты
pnpm test

# Проверка TypeScript
pnpm type-check

# Pre-deploy проверки (TypeScript + Prisma + API)
pnpm pre-deploy
```

---

## Документация

| Документ | Описание |
|----------|----------|
| [`docs/JUNIOR_GUIDE.md`](docs/JUNIOR_GUIDE.md) | Полное руководство для нового разработчика (глоссарий, архитектура, примеры, промты для Cursor AI) |

**PDF (со ссылками на репозиторий):** `pnpm docs:pdf` — создаёт в `docs/` файлы `README.pdf` и `JUNIOR_GUIDE.pdf`. Нужен установленный Chrome (или `PUPPETEER_EXECUTABLE_PATH`).
| [`docs/DEPLOY_PROCESS.md`](docs/DEPLOY_PROCESS.md) | Процесс деплоя |
| [`docs/VK_ID_AUTH.md`](docs/VK_ID_AUTH.md) | Настройка VK ID |
| [`DEPLOY-CHECKLIST.md`](DEPLOY-CHECKLIST.md) | Чек-лист деплоя и команды |
| [`.env.example`](.env.example) | Шаблон переменных окружения |

---

## Лицензия

Проприетарный. Все права защищены.
