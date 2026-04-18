# База данных — VK Cloud PostgreSQL

**Текущая прод-БД:** PostgreSQL в VK Cloud (83.166.237.161, база `myunion_db`). Локальная разработка и сервер приложения (79.143.29.66) подключаются к этой БД через `DATABASE_URL`.

Ниже — параметры подключения и инструкция по миграции (перенос уже выполнен).

---

## Параметры VK Cloud

- **Сервер:** 83.166.237.161:5432  
- **Пользователь:** myadminunion  
- **Пароль:** 7v2YY,3G59T68zR5s (в URL кодировать запятую как **%2C**)  

## Важно: создать БД в панели VK Cloud

У пользователя **нет прав создавать БД** и нет прав на схему `public` в базе `postgres`. Нужно:

1. Зайти в панель VK Cloud → ваш инстанс PostgreSQL.
2. **Создать новую базу данных** (например, имя: `myunion_db`). Обычно при создании БД пользователю выдаются права на неё.
3. В настройках доступа добавить IP сервера приложения: **79.143.29.66**.

После этого запускать миграцию с `NEW_DATABASE_URL=.../myunion_db`.

URL для приложения:
```text
postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db
```

---

## Шаг 1: Запуск миграции

Скрипт делает: создание БД на VK (если нет) → дамп текущей БД → восстановление в VK Cloud.

### Вариант A: с текущего сервера (79.143.29.66)

На сервере уже есть доступ к локальной PostgreSQL и можно достучаться до 83.166.237.161 (добавьте IP в белый список в VK Cloud).

```bash
cd /opt/my-union-pro

# Текущая БД (как в .env.local на сервере — возьмите оттуда USER и PASS)
export OLD_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/myunion_db"

# VK Cloud
export NEW_DATABASE_URL="postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db"

node scripts/migrate-db-to-vk-cloud.mjs
```

### Вариант B: с вашего компьютера

Нужен туннель к текущей БД и доступ к VK Cloud с вашей сети.

```bash
# В одном терминале — туннель к продакшен-БД
ssh -L 5432:localhost:5432 root@79.143.29.66

# В другом терминале (подставьте пароль от postgres с сервера)
export OLD_DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/myunion_db"
export NEW_DATABASE_URL="postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db"
node scripts/migrate-db-to-vk-cloud.mjs
```

Требуются установленные `pg_dump`, `pg_restore`, `psql` (например, `brew install libpq` на macOS).

---

## Шаг 2: Переключить приложение на VK Cloud

1. **На сервере** в `.env.local` (или где хранится `DATABASE_URL`) заменить на:
   ```bash
   DATABASE_URL="postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db"
   ```

2. Перезапустить приложение:
   ```bash
   pm2 restart my-union-pro
   pm2 restart my-union-socket
   ```

3. Проверить сайт и API (логин, данные).

---

## Шаг 3: Доступ к VK Cloud с сервера

В панели VK Cloud в настройках БД добавьте в белый список IP сервера приложения: **79.143.29.66**. Без этого подключение с сервера будет обрываться.

---

## Проверка после миграции

```bash
DATABASE_URL="postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db" npx prisma db execute --url "postgresql://myadminunion:7v2YY%2C3G59T68zR5s@83.166.237.161:5432/myunion_db" --stdin <<< "SELECT count(*) FROM \"User\";"
```

Или кратко:
```bash
node scripts/test-vk-cloud-db.mjs
```
(предварительно задать `DATABASE_URL_VK` с новым URL).
