# MyUnion Pro - Статус проекта

## 📋 Общая информация

**Проект:** MyUnion Pro - AI-агент для профсоюза  
**Технологии:** Next.js 16, TypeScript, Tailwind CSS, Prisma, NextAuth, OpenRouter AI  
**Путь проекта:** `/Users/renatusmanov/my-union-pro`

## ✅ Что уже сделано

### 1. Базовая структура проекта
- ✅ Создан Next.js проект с TypeScript и Tailwind CSS
- ✅ Настроен TailAdmin UI компоненты (скопированы из репозитория)
- ✅ Настроены провайдеры (NextAuth, ThemeProvider)
- ✅ Создана структура папок для компонентов

### 2. База данных (Prisma)
- ✅ Создана Prisma схема с моделями:
  - `User` - пользователи с ролями и статусами членства
  - `Organization` - организации (ППО, региональные, федерация)
  - `Document` - документы/заявления
  - `ChatMessage` - сообщения AI чата
  - `News` - новости
  - `Discount` - скидки
- ✅ Настроен Prisma Client (`lib/prisma.ts`)

### 3. Авторизация (NextAuth)
- ✅ Настроен NextAuth с Credentials провайдером
- ✅ Созданы типы для расширения сессии (`types/next-auth.d.ts`)
- ✅ API route: `/api/auth/[...nextauth]/route.ts`

### 4. Страницы авторизации
- ✅ `/login` - страница входа
- ✅ `/register` - регистрация с email валидацией (2 шага)
- ✅ `/forgot-password` - восстановление пароля
- ✅ `/reset-password` - сброс пароля по токену
- ✅ Layout для auth страниц с градиентным фоном справа

### 5. API Endpoints
- ✅ `POST /api/auth/register/send-code` - отправка кода подтверждения на email
- ✅ `POST /api/auth/register/verify-code` - проверка кода, создание пользователя, генерация системного пароля
- ✅ `POST /api/auth/forgot-password` - отправка ссылки для сброса пароля
- ✅ `POST /api/auth/reset-password` - сброс пароля по токену

### 6. Email функционал
- ✅ Настроен nodemailer с SMTP (Mail.ru)
- ✅ Функция `sendVerificationEmail()` - отправка кода подтверждения
- ✅ Функция `sendWelcomeEmail()` - отправка приветственного письма с паролем
- ✅ Функция отправки письма для восстановления пароля

### 7. UI Компоненты (TailAdmin)
- ✅ Скопированы компоненты из TailAdmin:
  - `components/auth/` - формы авторизации
  - `components/form/` - формы и инпуты
  - `components/ui/` - UI компоненты (Button, Badge, Modal, Table и т.д.)
  - `components/common/` - общие компоненты
  - `icons/` - SVG иконки
- ✅ Обновлен `InputField` для поддержки `value`, `required`, `maxLength`
- ✅ Обновлен `Button` для поддержки `type="submit"`

### 8. AI Чат для сбора данных профиля
- ✅ Интегрирован OpenRouter API для AI чата
- ✅ Создан API route `/api/chat` для отправки сообщений и получения ответов
- ✅ Создан API route `/api/chat/extract-profile` для извлечения данных из чата
- ✅ Компонент чата `components/chat/Chat.tsx` с историей сообщений
- ✅ Страница `/dashboard/chat` для чата
- ✅ Промпт для сбора данных профиля (ФИО, дата рождения, адрес, телефон, должность, профессия, образование, организация)
- ✅ Автоматическое сохранение данных профиля при завершении сбора
- ✅ Редирект на чат для пользователей с неполным профилем

### 9. Темная и светлая темы
- ✅ Настроена поддержка светлой и темной темы через `next-themes`
- ✅ Компонент `ThemeToggle` для переключения тем
- ✅ Компонент `Logo` с автоматическим переключением логотипов
- ✅ Компонент `LogoIcon` для иконок приложения
- ✅ Логотипы:
  - `Logo_dark_theme.svg` - для темной темы/темного фона
  - `Logo_light_theme.svg` - для светлой темы/светлого фона
  - `icon_dark.svg` - иконка для темной темы
  - `icon_light.svg` - иконка для светлой темы
- ✅ Все страницы авторизации поддерживают обе темы
- ✅ Форма входа с `dark:` классами для всех элементов

### 10. Конфигурация
- ✅ `.env.local` с переменными окружения:
  - DATABASE_URL
  - NEXTAUTH_URL, NEXTAUTH_SECRET
  - OPENROUTER_API_KEY
  - SMTP настройки (Mail.ru)
  - DADATA_API_KEY, DADATA_SECRET_KEY
  - ONESIGNAL настройки
- ✅ `next.config.ts` с поддержкой SVG через @svgr/webpack
- ✅ `globals.css` с TailAdmin стилями
- ✅ `tsconfig.json` настроен

## 🔄 Текущий статус

**AI Чат для сбора данных профиля реализован!**

Можно запустить:
```bash
cd /Users/renatusmanov/my-union-pro
pnpm dev
```

## 📝 Что нужно сделать дальше

### Приоритет 1: AI Чат для сбора данных профиля ✅
1. **Интегрировать OpenRouter API** ✅
   - ✅ Создан API route для чата (`/api/chat`)
   - ✅ Настроен промпт для сбора данных профиля
   - ✅ Сохранение сообщений в `ChatMessage`

2. **Создать страницу чата в dashboard** ✅
   - ✅ Компонент чата с историей сообщений (`components/chat/Chat.tsx`)
   - ✅ Форма ввода сообщения
   - ✅ Отображение ответов AI
   - ✅ Страница `/dashboard/chat`

3. **Логика сбора данных профиля** ✅
   - ✅ AI запрашивает: ФИО, дата рождения, адрес, телефон, должность, профессия, образование, организация
   - ✅ API для извлечения данных из чата (`/api/chat/extract-profile`)
   - ✅ Автоматическое сохранение данных в `User` модель при завершении профиля
   - ⏳ Загрузка подписи (файл на сервер) - следующий шаг

### Приоритет 2: Генерация PDF заявлений
1. **Установить библиотеку для PDF**
   ```bash
   pnpm add jspdf html2canvas
   ```

2. **Создать генератор PDF**
   - Заявление о вступлении в ППО
   - Заявление о взносах
   - Сохранение PDF в `/public/uploads/documents/`

3. **API для генерации**
   - `POST /api/documents/generate-membership` - заявление о вступлении
   - `POST /api/documents/generate-contributions` - заявление о взносах

4. **Отправка на проверку**
   - После генерации PDF → статус `PENDING`
   - Отправка председателю ППО на проверку

### Приоритет 3: Dashboard и меню
1. **Создать Dashboard Layout**
   - Sidebar с навигацией
   - Header с профилем и уведомлениями
   - Переключение темы

2. **Меню для разных ролей**
   - **Не член профсоюза** (`PENDING_MEMBER`, `PROFILE_INCOMPLETE`):
     - Чаты (AI чат)
     - Профиль
   
   - **Член профсоюза** (`APPROVED`):
     - Новости
     - Чаты
     - Скидки
     - Профиль
     - Настройки

3. **Страницы**
   - `/dashboard` - главная (редирект на чат для новых пользователей)
   - `/dashboard/chat` - AI чат
   - `/dashboard/profile` - профиль пользователя
   - `/dashboard/settings` - настройки (email, пароль, аватарка, ID)

### Приоритет 4: Интеграция DaData
1. **API для поиска организаций по ИНН**
   - `GET /api/organizations/search?inn=...`
   - Использовать DaData API для поиска

2. **Компонент поиска организаций**
   - Autocomplete поле с поиском
   - Отображение результатов

### Приоритет 5: Загрузка файлов
1. **Создать API для загрузки**
   - `POST /api/upload/signature` - загрузка подписи
   - Сохранение в `/public/uploads/signatures/`

2. **Компонент загрузки**
   - Drag & drop или выбор файла
   - Превью изображения

## 📁 Структура проекта

```
my-union-pro/
├── app/
│   ├── (auth)/              # Auth страницы
│   │   ├── login/
│   │   ├── register/
│   │   ├── forgot-password/
│   │   ├── reset-password/
│   │   └── layout.tsx
│   ├── api/
│   │   └── auth/
│   │       ├── [...nextauth]/
│   │       ├── register/
│   │       │   ├── send-code/
│   │       │   └── verify-code/
│   │       ├── forgot-password/
│   │       └── reset-password/
│   ├── dashboard/           # Dashboard страницы
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Главная (редирект)
│   └── globals.css           # TailAdmin стили
├── components/
│   ├── auth/                 # Auth компоненты
│   ├── form/                 # Формы и инпуты
│   ├── ui/                   # UI компоненты
│   ├── common/               # Общие компоненты
│   └── Providers.tsx       # Провайдеры
├── lib/
│   ├── prisma.ts             # Prisma Client
│   ├── auth.ts               # NextAuth конфиг
│   ├── email.ts              # Email функции
│   └── utils.ts              # Утилиты
├── prisma/
│   └── schema.prisma         # Prisma схема
├── types/
│   ├── next-auth.d.ts        # NextAuth типы
│   └── svg.d.ts              # SVG типы
├── icons/                    # SVG иконки
├── .env.local                # Переменные окружения
└── package.json

```

## 🔑 Важные детали

### Роли пользователей (UserRole)
- `MEMBER` - обычный член профсоюза
- `PENDING_MEMBER` - ожидает одобрения
- `PPO_HEAD` - председатель ППО
- `REGIONAL_CHAIRMAN` - председатель регионального отделения
- `FEDERAL_CHAIRMAN` - председатель федерации
- `SUPER_ADMIN` - суперадмин

### Статусы членства (MembershipStatus)
- `PENDING_VERIFICATION` - ожидает проверки email
- `PROFILE_INCOMPLETE` - email подтвержден, профиль не заполнен
- `DOCUMENTS_PENDING` - документы отправлены на проверку
- `APPROVED` - одобрен как член профсоюза
- `REJECTED` - отклонен
- `SUSPENDED` - приостановлен

### Процесс регистрации
1. Пользователь вводит email → отправляется код на email
2. Пользователь вводит код → создается аккаунт с системным паролем
3. Пароль отправляется на email
4. Пользователь входит → открывается AI чат для заполнения профиля
5. AI собирает данные → пользователь заполняет профиль
6. Генерируются 2 PDF заявления → пользователь подписывает и загружает
7. Заявления отправляются председателю ППО на проверку
8. После одобрения → статус меняется на `APPROVED`, открывается полное меню

## 🛠 Технические детали

### Email (SMTP)
- Хост: `smtp.mail.ru`
- Порт: `465`
- Пользователь: `support@myunion.pro`
- Пароль: в `.env.local`

### OpenRouter API
- Ключ: `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`
- Использовать для AI чата

### DaData API
- API Key: `a12104dc4412d6a72a1adf7d4cc9a75428266690`
- Secret Key: `f809e7b27bc2122758df32669efdc4887e795898`
- Использовать для поиска организаций по ИНН

### База данных
- PostgreSQL
- URL: `postgresql://postgres:Tanyuwa2018@localhost:5432/myunion`

## 🚀 Команды для запуска

```bash
# Перейти в проект
cd /Users/renatusmanov/my-union-pro

# Установить зависимости (если нужно)
pnpm install

# Запустить миграции Prisma (если нужно)
pnpm prisma migrate dev

# Запустить dev сервер
pnpm dev

# Сгенерировать Prisma Client (если нужно)
pnpm prisma generate
```

## 📚 Полезные ссылки

- TailAdmin: https://github.com/TailAdmin/free-nextjs-admin-dashboard
- NextAuth v5: https://authjs.dev/
- Prisma: https://www.prisma.io/docs
- OpenRouter: https://openrouter.ai/docs
- DaData: https://dadata.ru/api/

## ⚠️ Важные заметки

1. **Не использовать Cloudinary** - файлы хранить локально на VDS в `/public/uploads/`
2. **Все UI компоненты из TailAdmin** - не создавать кастомные компоненты до MVP
3. **Строго следовать процессу регистрации** - email → код → пароль → AI чат → профиль → PDF → проверка
4. **Ролевая модель** - проверять права доступа на всех страницах
5. **Темная тема** - использовать `next-themes` с `class="dark"`

## 🎯 Следующие шаги

1. Запустить проект и протестировать регистрацию/авторизацию
2. Создать AI чат с OpenRouter
3. Реализовать сбор данных профиля через чат
4. Создать генератор PDF заявлений
5. Создать dashboard с меню для разных ролей

---

**Последнее обновление:** 
- ✅ Подключено к PostgreSQL БД на Timeweb Cloud (194.31.173.95:5432/myunion_db)
- ✅ Создан супер-администратор support@myunion.pro (пароль: Admin@123456)
- ✅ Создана админ-панель `/admin` с 4 разделами
- ✅ API для управления системными настройками (SMTP, OpenRouter, DaData, OneSignal)
- ✅ Загрузка данных обучения AI чата (CSV/JSON)
- ✅ Семя скрипт для импорта настроек из .env
- ✅ Build пройден, код закоммичен

## 🔐 Доступ к админ-панели

**URL:** `http://localhost:3000/admin`
**Email:** `support@myunion.pro`