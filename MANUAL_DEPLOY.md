# 🚀 Ручной деплой на VDS (если скрипт не работает)

## Команды для копирования

Выполните эти команды одну за другой в терминале:

### 1. Подключитесь к серверу
```bash
ssh root@194.87.49.210
# Пароль: sAt,8?Bh+Ny_BW
```

### 2. Настройте nginx для больших файлов (если еще не сделано)
```bash
# Добавьте client_max_body_size в nginx конфигурацию
sed -i '/server {/a\    client_max_body_size 50M;' /etc/nginx/sites-enabled/myunion.pro

# Проверьте конфигурацию
nginx -t

# Перезагрузите nginx
systemctl reload nginx
```

### 3. Выполните деплой на сервере
```bash
cd /opt/my-union-pro

# Остановить приложение
pm2 stop my-union-pro

# Обновить код
git pull origin main

# Установить зависимости
pnpm install

# Сгенерировать Prisma клиент
npx prisma generate

# Применить миграции (ВАЖНО!)
npx prisma migrate deploy

# Собрать приложение
pnpm build

# Перезапустить приложение
pm2 restart my-union-pro

# Проверить статус
pm2 logs my-union-pro --lines 50
```

### 3. Проверьте работу
Откройте https://myunion.pro и проверьте:
- ✅ Удаление сообщений
- ✅ Редактирование сообщений
- ✅ Загрузка HEIC фото

---

## Или одной командой с вашего компьютера:

```bash
ssh root@194.87.49.210 'sed -i "/server {/a\    client_max_body_size 50M;" /etc/nginx/sites-enabled/myunion.pro 2>/dev/null; nginx -t && systemctl reload nginx; cd /opt/my-union-pro && pm2 stop my-union-pro && git pull origin main && pnpm install && npx prisma generate && npx prisma migrate deploy && pnpm build && pm2 restart my-union-pro && pm2 logs my-union-pro --lines 50'
```

Пароль: `sAt,8?Bh+Ny_BW`

**Примечание:** Команда автоматически настроит nginx (если еще не настроен) и выполнит полный деплой.

---

## Если всё равно не работает

1. **Очистите кэш браузера** (обязательно!): Cmd+Shift+R
2. **Проверьте логи**: `pm2 logs my-union-pro`
3. **Проверьте базу данных**: убедитесь, что миграция применилась
4. **Перезапустите сервер**: `pm2 restart my-union-pro`

