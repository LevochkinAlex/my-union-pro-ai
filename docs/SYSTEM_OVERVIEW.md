# MyUnion Pro - Обзор системы

## Версия: 1.5.0

## Архитектура

MyUnion Pro - это веб-приложение для управления профсоюзом работников здравоохранения, построенное на Next.js 16 с использованием TypeScript, Prisma ORM и PostgreSQL.

## Основные компоненты

### 1. Аутентификация и авторизация

- **SMS авторизация**: PIN-коды через SMS или Telegram
- **Email авторизация**: Традиционная авторизация по email/паролю
- **Telegram интеграция**: Привязка Telegram для получения PIN-кодов
- **NextAuth.js**: Управление сессиями

### 2. Управление пользователями

- Профили пользователей с полной информацией
- Роли: MEMBER, PENDING_MEMBER, PPO_HEAD, REGIONAL_CHAIRMAN, FEDERAL_CHAIRMAN, SUPER_ADMIN
- Статусы членства: PENDING_VERIFICATION, PROFILE_INCOMPLETE, DOCUMENTS_PENDING, APPROVED, REJECTED, SUSPENDED

### 3. Конструктор документов

- **WYSIWYG редактор**: TinyMCE для создания шаблонов документов
- **Шаблоны документов**: HTML шаблоны с переменными
- **Генерация PDF**: Puppeteer для конвертации HTML в PDF
- **Типы документов**: Заявления о вступлении, взносах, обращения и т.д.

См. [DOCUMENT_TEMPLATES_GUIDE.md](./DOCUMENT_TEMPLATES_GUIDE.md) для подробностей.

### 4. AI Чат-боты

- **Appeal Bot**: Бот для обработки обращений
- **Main Chat Bot**: Основной помощник пользователя
- **База знаний**: Векторный поиск по документам профсоюза
- **OpenRouter/OpenAI**: Интеграция с AI моделями

### 5. Новости и контент

- Управление новостями профсоюза
- Лайки и комментарии
- Опросы и голосования

### 6. Скидки и льготы

- Интеграция с BestBenefits
- Каталог скидок
- Персональные предпочтения пользователей

### 7. Обращения (Тикеты)

- Система тикетов для обращений
- Категории: LEGAL, ACCOUNTING, TECHNICAL, HR, OTHER
- Статусы: PENDING, IN_PROGRESS, RESOLVED, REJECTED, CLOSED

### 8. Push уведомления

- Firebase Cloud Messaging
- Настройки уведомлений для пользователей

## Технологический стек

### Frontend

- **Next.js 16**: React фреймворк с App Router
- **React 19**: UI библиотека
- **TypeScript**: Типизация
- **Tailwind CSS**: Стилизация
- **TinyMCE**: WYSIWYG редактор
- **NextAuth.js**: Аутентификация

### Backend

- **Next.js API Routes**: REST API
- **Prisma ORM**: Работа с базой данных
- **PostgreSQL**: База данных
- **Puppeteer**: Генерация PDF
- **BullMQ/Redis**: Очереди задач
- **Firebase Admin SDK**: Push уведомления

### Интеграции

- **Telegram Bot API**: Отправка PIN-кодов
- **DaData API**: Склонение ФИО
- **BestBenefits API**: Каталог скидок
- **OpenRouter/OpenAI**: AI модели

## Структура проекта

```
my-union-pro-ai/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Страницы авторизации
│   ├── admin/             # Админ-панель
│   ├── api/               # API endpoints
│   ├── dashboard/         # Пользовательский интерфейс
│   └── ...
├── components/            # React компоненты
│   ├── admin/            # Компоненты админ-панели
│   ├── dashboard/        # Компоненты дашборда
│   └── ...
├── lib/                   # Утилиты и библиотеки
│   ├── document-templates/ # Генерация документов
│   ├── knowledge/         # База знаний
│   ├── pdf/              # Старые PDF генераторы (deprecated)
│   └── ...
├── prisma/               # Prisma схема и миграции
├── scripts/              # Утилитарные скрипты
├── public/               # Статические файлы
└── docs/                 # Документация
```

## База данных

### Основные модели

- **User**: Пользователи системы
- **Organization**: Организации
- **Document**: Документы пользователей
- **DocumentTemplate**: Шаблоны документов
- **ChatBot**: AI чат-боты
- **KnowledgeBase**: Базы знаний
- **NewsPost**: Новости
- **Ticket**: Обращения
- **DiscountPreference**: Предпочтения по скидкам

## API Endpoints

### Публичные

- `POST /api/auth/sms/send-pin` - Отправка PIN-кода
- `POST /api/auth/sms/verify-pin` - Проверка PIN-кода
- `POST /api/auth/telegram/callback` - Callback от Telegram

### Пользовательские

- `GET /api/documents` - Список документов
- `POST /api/documents/generate` - Генерация документов
- `GET /api/documents/[id]/download` - Скачивание документа
- `GET /api/profile` - Профиль пользователя
- `POST /api/assistant/chat` - AI чат

### Административные

- `GET /api/admin/document-templates` - Список шаблонов
- `POST /api/admin/document-templates` - Создание шаблона
- `PUT /api/admin/document-templates/[id]` - Обновление шаблона
- `DELETE /api/admin/document-templates/[id]` - Удаление шаблона

## Переменные окружения

### Обязательные

```env
DATABASE_URL=postgresql://user:password@host:5432/database
NEXTAUTH_URL=http://localhost:3004
NEXTAUTH_SECRET=your-secret-key
```

### Опциональные

```env
# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_USERNAME=your-bot-username

# AI
OPENROUTER_API_KEY=your-api-key

# DaData
DADATA_API_KEY=your-api-key
DADATA_SECRET_KEY=your-secret-key

# Puppeteer
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Redis
REDIS_URL=redis://localhost:6379
```

## Развертывание

### Локальная разработка

```bash
# Установка зависимостей
pnpm install

# Настройка базы данных
pnpm prisma:push

# Создание начальных шаблонов
pnpm tsx scripts/create-initial-document-templates.ts

# Запуск dev сервера
pnpm dev
```

### Production

```bash
# Сборка
pnpm build

# Запуск
pnpm start
```

## Скрипты

- `pnpm dev` - Запуск dev сервера
- `pnpm build` - Сборка для production
- `pnpm start` - Запуск production сервера
- `pnpm prisma:push` - Применить изменения схемы БД
- `pnpm prisma:studio` - Открыть Prisma Studio
- `pnpm tsx scripts/create-initial-document-templates.ts` - Создать начальные шаблоны
- `pnpm tsx scripts/cleanup-orphaned-documents.ts` - Очистить документы несуществующих пользователей

## Безопасность

- Все API endpoints защищены авторизацией
- Административные функции доступны только SUPER_ADMIN
- PIN-коды хешируются перед сохранением
- Пароли хешируются с помощью bcryptjs
- CORS настроен для защиты от CSRF

## Мониторинг и логирование

- Системные логи в таблице `SystemLog`
- Логирование ошибок в консоль
- Мониторинг через админ-панель `/admin/logs`

## Документация

- [DOCUMENT_TEMPLATES_GUIDE.md](./DOCUMENT_TEMPLATES_GUIDE.md) - Руководство по конструктору документов
- [SYSTEM_OVERVIEW.md](./SYSTEM_OVERVIEW.md) - Этот файл

## Поддержка

Для вопросов и проблем обращайтесь к администратору системы.

