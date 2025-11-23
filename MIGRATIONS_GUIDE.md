# 📋 Руководство по миграциям базы данных

## ❌ Проблема

При выполнении команд `npx prisma migrate dev` или `npx prisma db push` на сервере возникала ошибка:
```
Error: Environment variable not found: DATABASE_URL.
```

Это происходило потому что Prisma не загружал переменные из `.env` файла автоматически.

## ✅ Решение

Создан shell скрипт `scripts/migrate-db.sh`, который:
1. Автоматически загружает переменные из `.env`
2. Проверяет наличие `DATABASE_URL`
3. Выполняет нужную команду Prisma

---

## 🚀 Как добавить новое поле в базу данных

### 1️⃣ Локально: Обновите schema.prisma

Добавьте новое поле в `prisma/schema.prisma`:

```prisma
model User {
  // ... существующие поля
  newField String? // Ваше новое поле
}
```

### 2️⃣ Локально: Создайте миграцию (опционально)

Если нужна миграция:
```bash
cd /Users/renatusmanov/my-union-pro-ai
pnpm prisma:migrate
```

Это создаст файл миграции в `prisma/migrations/`.

### 3️⃣ Закоммитьте и запушьте изменения

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "Добавлено поле newField в User"
git push origin main
```

### 4️⃣ На сервере: Выполните миграцию

**Подключитесь к серверу:**
```bash
export SSHPASS='sAt,8?Bh+Ny_BW'
sshpass -e ssh root@194.87.49.210
```

**Перейдите в проект:**
```bash
cd /opt/my-union-pro
```

**Обновите код:**
```bash
git pull
```

**Выполните миграцию одним из способов:**

#### Способ A: Синхронизация схемы (рекомендуется для простых изменений)
```bash
./scripts/migrate-db.sh push
```

#### Способ Б: Применить существующие миграции
```bash
./scripts/migrate-db.sh deploy
```

#### Способ В: Создать новую миграцию на сервере
```bash
./scripts/migrate-db.sh dev "migration_name"
```

**Перезапустите приложение:**
```bash
pm2 restart ecosystem.config.js
```

---

## 🔧 Команды migrate-db.sh

### `./scripts/migrate-db.sh push`
- **Когда использовать:** Для быстрой синхронизации схемы без создания файлов миграций
- **Что делает:** Применяет изменения из `schema.prisma` напрямую в БД
- **Плюсы:** Быстро, удобно для разработки
- **Минусы:** Не создает историю миграций

### `./scripts/migrate-db.sh deploy`
- **Когда использовать:** Для применения существующих миграций из `prisma/migrations/`
- **Что делает:** Выполняет все непримененные миграции
- **Плюсы:** Сохраняет историю миграций, безопасно для production
- **Минусы:** Требует наличия файлов миграций

### `./scripts/migrate-db.sh dev [name]`
- **Когда использовать:** Для создания новой миграции на сервере
- **Что делает:** Создает файл миграции и применяет его
- **Плюсы:** Создает историю миграций
- **Минусы:** Может создать конфликты, если миграции уже есть локально

---

## 💡 Рекомендуемый workflow

### Для простых изменений (добавление nullable полей):
```bash
# Локально
1. Измените prisma/schema.prisma
2. git add + commit + push

# На сервере
3. ssh на сервер
4. cd /opt/my-union-pro && git pull
5. ./scripts/migrate-db.sh push
6. pm2 restart ecosystem.config.js
```

### Для сложных изменений (изменение типов, удаление полей):
```bash
# Локально
1. Измените prisma/schema.prisma
2. pnpm prisma:migrate
3. git add + commit + push

# На сервере
4. ssh на сервер
5. cd /opt/my-union-pro && git pull
6. ./scripts/migrate-db.sh deploy
7. pm2 restart ecosystem.config.js
```

---

## 🆘 Troubleshooting

### Ошибка: "permission denied: ./scripts/migrate-db.sh"
```bash
chmod +x ./scripts/migrate-db.sh
```

### Ошибка: ".env файл не найден"
Убедитесь что вы в `/opt/my-union-pro`:
```bash
pwd  # Должно вывести /opt/my-union-pro
ls -la .env  # Проверить что .env существует
```

### Ошибка: "DATABASE_URL не найден в .env"
Проверьте содержимое .env:
```bash
cat .env | grep DATABASE_URL
```

### Миграция зависла
Проверьте активные подключения к БД и прервите миграцию:
```bash
pm2 logs  # Посмотреть логи
# Если нужно, прервите миграцию и попробуйте снова
```

---

## 📝 Автоматизация через Cursor/локальную машину

Вместо подключения к серверу вручную, можно выполнить все через sshpass:

```bash
export SSHPASS='sAt,8?Bh+Ny_BW'

# Скопировать schema.prisma на сервер
sshpass -e scp prisma/schema.prisma root@194.87.49.210:/opt/my-union-pro/prisma/

# Выполнить миграцию
sshpass -e ssh root@194.87.49.210 "cd /opt/my-union-pro && ./scripts/migrate-db.sh push && pm2 restart ecosystem.config.js"
```

---

## 🎯 Резюме

**Всегда используйте `./scripts/migrate-db.sh` для миграций на сервере!**

Это гарантирует что:
- ✅ DATABASE_URL будет загружен из .env
- ✅ Миграция выполнится успешно
- ✅ Не будет раздражающих ошибок с Prisma
- ✅ Процесс будет быстрым и надежным

