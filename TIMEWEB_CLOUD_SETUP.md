# 🌐 Конфигурация для Timeweb Cloud PostgreSQL

## Настройка подключения

### 1. Создание базы данных в Timeweb Cloud
1. Войдите в панель управления [Timeweb Cloud](https://timeweb.cloud/my/database)
2. Нажмите "Создать" для создания новой базы данных
3. Выберите PostgreSQL
4. Настройте конфигурацию (рекомендуется минимум 1GB RAM для начала)
5. Создайте базу данных

### 2. Получение данных подключения
После создания базы данных вы получите:
- **Host** (хост)
- **Port** (порт, обычно 5432)
- **Database** (имя базы данных)
- **Username** (имя пользователя)
- **Password** (пароль)

### 3. Настройка переменных окружения

#### Для разработки (.env.local):
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

#### Для продакшена (.env.production):
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

## 🚀 Миграция данных

### 1. Применение схемы
```bash
# Генерация Prisma Client
pnpm exec prisma generate

# Применение миграций
pnpm exec prisma db push

# Загрузка тестовых данных
pnpm run db:seed
```

### 2. Проверка подключения
```bash
# Открытие Prisma Studio
pnpm exec prisma studio

# Проверка через psql (если установлен)
psql "postgresql://username:password@host:port/database_name?sslmode=require"
```

## 🔒 Безопасность

### 1. Настройка SSL
Timeweb Cloud поддерживает SSL подключения. Обязательно используйте `sslmode=require` в строке подключения.

### 2. Firewall
Настройте firewall в Timeweb Cloud, чтобы разрешить подключения только с ваших серверов.

### 3. Резервное копирование
Timeweb Cloud предоставляет автоматические бэкапы. Настройте расписание бэкапов в панели управления.

## 📊 Мониторинг

### 1. Метрики в панели управления
- Использование CPU
- Использование памяти
- Количество подключений
- Размер базы данных

### 2. Логи
Просматривайте логи подключений и ошибок в панели управления Timeweb Cloud.

## 💰 Стоимость

Timeweb Cloud предлагает гибкие тарифы:
- **Минимальный тариф** - от 300₽/месяц
- **Масштабирование** - по требованию
- **Автоматические бэкапы** - включены

## 🆘 Поддержка

- **Документация**: [docs.timeweb.cloud](https://docs.timeweb.cloud)
- **Поддержка**: через панель управления
- **TimewebGPT**: встроенный чат-бот для помощи
