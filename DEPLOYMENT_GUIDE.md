# Инструкция по деплою MyUnion Pro

## Быстрый деплой

### 1. Подключение к VDS

```bash
# Подключение по SSH
ssh -i ~/.ssh/myunion_vds -o StrictHostKeyChecking=no root@194.87.49.210

# Или если ключ в другом месте
ssh -i /path/to/myunion_vds root@194.87.49.210
```

### 2. Переход в директорию проекта

```bash
cd /opt/my-union-pro
```

### 3. Получение последних изменений из Git

```bash
git pull origin main
```

### 4. Сборка проекта

```bash
# Очистка старой сборки (опционально, если есть проблемы)
rm -rf .next

# Сборка
pnpm build
```

### 5. Перезапуск приложения

```bash
pm2 restart my-union-pro
```

### 6. Проверка статуса

```bash
# Статус PM2
pm2 status

# Проверка API
curl -s -o /dev/null -w "Status: %{http_code}\n" https://myunion.pro/api/health

# Логи (последние 20 строк)
pm2 logs my-union-pro --lines 20 --nostream
```

---

## Полная команда одной строкой

```bash
ssh -i ~/.ssh/myunion_vds -o StrictHostKeyChecking=no root@194.87.49.210 'cd /opt/my-union-pro && git pull origin main && pnpm build 2>&1 | tail -10 && pm2 restart my-union-pro && sleep 3 && curl -s -o /dev/null -w "Status: %{http_code}\n" https://myunion.pro/api/health'
```

---

## Настройка SSH ключа (если нужно)

### 1. Генерация SSH ключа (если нет)

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/myunion_vds -C "myunion-deploy"
```

### 2. Копирование публичного ключа на сервер

```bash
ssh-copy-id -i ~/.ssh/myunion_vds.pub root@194.87.49.210
```

Или вручную:

```bash
cat ~/.ssh/myunion_vds.pub | ssh root@194.87.49.210 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### 3. Настройка прав доступа

```bash
chmod 600 ~/.ssh/myunion_vds
chmod 644 ~/.ssh/myunion_vds.pub
```

---

## Полезные команды для мониторинга

### PM2

```bash
# Статус всех процессов
pm2 status

# Детальная информация
pm2 show my-union-pro

# Логи в реальном времени
pm2 logs my-union-pro

# Последние N строк логов
pm2 logs my-union-pro --lines 50 --nostream

# Перезапуск
pm2 restart my-union-pro

# Остановка
pm2 stop my-union-pro

# Запуск
pm2 start my-union-pro

# Удаление из PM2
pm2 delete my-union-pro
```

### Системные метрики

```bash
# Использование диска
df -h

# Использование памяти
free -h

# Загрузка CPU
top -bn1 | head -20

# Процессы Node.js
ps aux | grep node
```

### Nginx

```bash
# Проверка конфигурации
nginx -t

# Перезагрузка конфигурации
systemctl reload nginx

# Статус
systemctl status nginx

# Логи
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### База данных

```bash
# Подключение к PostgreSQL
# (используйте DATABASE_URL из .env.local)
psql $DATABASE_URL

# Или через переменные окружения
cd /opt/my-union-pro
source .env.local
psql $DATABASE_URL
```

### Prisma

```bash
cd /opt/my-union-pro

# Применение миграций
npx prisma migrate deploy

# Синхронизация схемы (без миграций)
npx prisma db push

# Генерация Prisma Client
npx prisma generate

# Prisma Studio (веб-интерфейс для БД)
npx prisma studio
```

---

## Переменные окружения

### Расположение файла

```bash
/opt/my-union-pro/.env.local
```

### Важные переменные

```env
# База данных
DATABASE_URL="postgresql://user:password@host:5432/database"

# NextAuth
NEXTAUTH_URL="https://myunion.pro"
NEXTAUTH_SECRET="your-secret-key"

# Sentry
NEXT_PUBLIC_SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"
SENTRY_DSN="https://xxx@xxx.ingest.sentry.io/xxx"

# VDS Storage
VDS_STORAGE_HOST="194.87.49.210"
VDS_STORAGE_PASSWORD="password"
# или
VDS_STORAGE_PRIVATE_KEY_PATH="/path/to/key"

# CDN
CDN_BASE_URL="https://cdn.myunion.pro"
```

### Редактирование переменных

```bash
# Через nano
nano /opt/my-union-pro/.env.local

# Через vim
vim /opt/my-union-pro/.env.local

# После изменения - перезапуск PM2
pm2 restart my-union-pro --update-env
```

---

## Решение проблем

### Ошибка "Could not find a production build"

```bash
cd /opt/my-union-pro
rm -rf .next
pnpm build
pm2 restart my-union-pro
```

### Ошибка 502/503

```bash
# Проверка статуса PM2
pm2 status

# Проверка логов
pm2 logs my-union-pro --lines 50 --nostream

# Пересборка
cd /opt/my-union-pro
rm -rf .next
pnpm build
pm2 restart my-union-pro
```

### Ошибка подключения к БД

```bash
# Проверка DATABASE_URL
cd /opt/my-union-pro
grep DATABASE_URL .env.local

# Проверка доступности БД
psql $DATABASE_URL -c "SELECT 1;"
```

### Ошибка Prisma

```bash
cd /opt/my-union-pro

# Регенерация Prisma Client
npx prisma generate

# Синхронизация схемы
npx prisma db push

# Пересборка
pnpm build
pm2 restart my-union-pro
```

### Очистка кеша

```bash
# Очистка Next.js кеша
cd /opt/my-union-pro
rm -rf .next

# Очистка node_modules (если нужно)
rm -rf node_modules
pnpm install
pnpm build
```

---

## Мониторинг

### Grafana Dashboard

- URL: https://myunion.pro/grafana/
- Логин: `admin`
- Пароль: `admin` (рекомендуется сменить)

### Prometheus

- URL: http://localhost:9090 (только на сервере)
- Метрики: http://localhost:9100/metrics (Node Exporter)

### Sentry

- Dashboard: https://yappix-llc-vk.sentry.io/
- Проект: `javascript-nextjs`

---

## Структура проекта на сервере

```
/opt/my-union-pro/
├── .env.local              # Переменные окружения
├── .next/                  # Собранное приложение
├── app/                    # Next.js приложение
├── components/             # React компоненты
├── lib/                    # Утилиты
├── prisma/                 # Prisma схемы и миграции
├── public/                 # Статические файлы
├── scripts/                # Скрипты
├── node_modules/           # Зависимости
├── package.json            # Зависимости проекта
└── pm2.config.js          # Конфигурация PM2 (если есть)
```

---

## Полезные скрипты

### Быстрый деплой (локально)

Создайте файл `deploy.sh`:

```bash
#!/bin/bash
ssh -i ~/.ssh/myunion_vds -o StrictHostKeyChecking=no root@194.87.49.210 'cd /opt/my-union-pro && git pull origin main && pnpm build 2>&1 | tail -10 && pm2 restart my-union-pro && sleep 3 && curl -s -o /dev/null -w "Status: %{http_code}\n" https://myunion.pro/api/health'
```

Сделайте исполняемым:

```bash
chmod +x deploy.sh
```

Использование:

```bash
./deploy.sh
```

---

## Контакты и информация

- **VDS IP**: 194.87.49.210
- **Домен**: https://myunion.pro
- **CDN**: https://cdn.myunion.pro
- **Grafana**: https://myunion.pro/grafana/
- **Sentry**: https://yappix-llc-vk.sentry.io/

---

## Чеклист перед деплоем

- [ ] Все изменения закоммичены в Git
- [ ] Изменения запушены в `origin/main`
- [ ] Локально нет ошибок билда (`pnpm build`)
- [ ] Проверены переменные окружения на сервере
- [ ] Создана резервная копия БД (если нужны миграции)

---

## Чеклист после деплоя

- [ ] PM2 статус: `online`
- [ ] API health check: `200 OK`
- [ ] Нет ошибок в логах PM2
- [ ] Приложение открывается в браузере
- [ ] Критичные функции работают (логин, профиль, чат)

