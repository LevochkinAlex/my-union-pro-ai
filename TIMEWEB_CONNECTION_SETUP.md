# 🔗 Настройка подключения к Timeweb Cloud

## Создайте файл .env.local в корне проекта:

```bash
# Timeweb Cloud PostgreSQL
DATABASE_URL="postgresql://gen_user:%3C!zq%3F)gO4K8lvh@194.31.173.95:5432/myunion_db?schema=public&sslmode=require"

# JWT секрет
JWT_SECRET="my-union-super-secret-jwt-key-2024"

# Email настройки (для тестирования)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="your-email@gmail.com"

# Настройки приложения
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="my-union-nextauth-secret-2024"
```

## Данные подключения:
- **Host**: 194.31.173.95
- **Port**: 5432
- **Database**: myunion_db
- **Username**: gen_user
- **Password**: <!zq?)gO4K8lvh

## Следующие шаги:
1. Создайте файл .env.local с содержимым выше
2. Запустите: npm run db:generate
3. Запустите: npm run db:push
4. Запустите: npm run db:seed
5. Запустите: npm run db:test-timeweb
