# 🚀 Миграция на Timeweb Cloud PostgreSQL

## 📋 Пошаговая инструкция

### 1. Создание базы данных в Timeweb Cloud
1. Войдите в [панель управления Timeweb Cloud](https://timeweb.cloud/my/database)
2. Нажмите **"Создать"** для создания новой базы данных
3. Выберите **PostgreSQL**
4. Настройте конфигурацию:
   - **RAM**: минимум 1GB (рекомендуется 2GB)
   - **Диск**: минимум 20GB
   - **Регион**: выберите ближайший к вашим пользователям
5. Создайте базу данных

### 2. Получение данных подключения
После создания вы получите:
- **Host** (хост)
- **Port** (порт, обычно 5432)
- **Database** (имя базы данных)
- **Username** (имя пользователя)
- **Password** (пароль)

### 3. Настройка переменных окружения

#### Создайте файл `.env.local`:
```bash
# Timeweb Cloud PostgreSQL
DATABASE_URL="postgresql://username:password@host:port/database_name?schema=public&sslmode=require"

# JWT секрет
JWT_SECRET="your-super-secret-jwt-key-change-in-production"

# Email настройки
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="your-email@gmail.com"

# Настройки приложения
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret"
```

### 4. Применение схемы и данных
```bash
# Генерация Prisma Client
pnpm run db:generate

# Применение схемы
pnpm run db:push

# Загрузка тестовых данных
pnpm run db:seed

# Тестирование подключения
pnpm run db:test-timeweb
```

### 5. Проверка работы
```bash
# Запуск приложения
pnpm run dev

# Открытие Prisma Studio
pnpm run db:studio
```

## 🔧 Полезные команды

```bash
# Локальная разработка с Docker
pnpm run db:local

# Тестирование подключения к Timeweb Cloud
pnpm run db:test-timeweb

# Веб-интерфейс базы данных
pnpm run db:studio

# Применение изменений схемы
pnpm run db:push

# Загрузка тестовых данных
pnpm run db:seed
```

## 🚀 Для продакшена

### 1. Настройка переменных окружения
Создайте файл `.env.production`:
```bash
# Timeweb Cloud PostgreSQL (продакшен)
DATABASE_URL="postgresql://username:password@host:port/database_name?schema=public&sslmode=require"

# JWT секрет (измените в продакшене!)
JWT_SECRET="your-production-super-secret-jwt-key"

# Email настройки (продакшен)
SMTP_HOST="smtp.your-domain.com"
SMTP_PORT="587"
SMTP_USER="noreply@your-domain.com"
SMTP_PASS="your-production-smtp-password"
SMTP_FROM="noreply@your-domain.com"

# Настройки приложения (продакшен)
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-production-nextauth-secret"
```

### 2. Развертывание
```bash
# Сборка приложения
pnpm run build

# Запуск в продакшене
pnpm run start
```

## 🔒 Безопасность

### 1. SSL подключения
Обязательно используйте `sslmode=require` в строке подключения.

### 2. Firewall
Настройте firewall в Timeweb Cloud для разрешения подключений только с ваших серверов.

### 3. Резервное копирование
Настройте автоматические бэкапы в панели управления Timeweb Cloud.

## 📊 Мониторинг

### 1. Метрики в панели управления
- Использование CPU
- Использование памяти
- Количество подключений
- Размер базы данных

### 2. Логи
Просматривайте логи подключений и ошибок в панели управления.

## 💰 Стоимость

Timeweb Cloud предлагает гибкие тарифы:
- **Минимальный тариф** - от 300₽/месяц
- **Масштабирование** - по требованию
- **Автоматические бэкапы** - включены

## 🆘 Поддержка

- **Документация**: [docs.timeweb.cloud](https://docs.timeweb.cloud)
- **Поддержка**: через панель управления
- **TimewebGPT**: встроенный чат-бот для помощи
