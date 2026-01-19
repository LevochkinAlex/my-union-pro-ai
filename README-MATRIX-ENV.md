# Проверка переменных окружения Matrix

## Необходимые переменные

Для работы создания чатов через Matrix API требуются следующие переменные окружения:

1. **MATRIX_SERVER_URL** (опционально, дефолт: `https://matrix.myunion.pro`)
   - URL сервера Matrix/Synapse
   
2. **MATRIX_ADMIN_TOKEN** (обязательно)
   - Токен администратора Matrix для создания комнат через admin API

## Проверка на сервере

Выполните на сервере:

```bash
ssh root@194.87.49.210
cd /opt/my-union-pro

# Проверка наличия переменных
echo "=== Проверка .env.local ==="
if [ -f .env.local ]; then
  echo "Файл существует"
  grep "^MATRIX_SERVER_URL" .env.local || echo "MATRIX_SERVER_URL НЕ НАЙДЕН"
  grep "^MATRIX_ADMIN_TOKEN" .env.local && echo "MATRIX_ADMIN_TOKEN найден" || echo "MATRIX_ADMIN_TOKEN НЕ НАЙДЕН"
else
  echo "Файл .env.local НЕ существует"
fi
```

## Добавление переменных

Если переменные отсутствуют, добавьте их в `.env.local`:

```bash
cd /opt/my-union-pro
nano .env.local
```

Добавьте строки:
```
MATRIX_SERVER_URL=https://matrix.myunion.pro
MATRIX_ADMIN_TOKEN=ваш_токен_администратора
```

После добавления перезапустите приложение:
```bash
pm2 restart my-union-pro
```

## Где взять MATRIX_ADMIN_TOKEN

**Подробная инструкция:** См. файл `HOW-TO-GET-MATRIX-ADMIN-TOKEN.md`

**Кратко:**
1. **Через API Matrix (рекомендуется):**
   - Войдите как администратор через `/login`
   - Создайте постоянный токен через `/admin/v1/users/@admin:matrix.myunion.pro/access_token`
   
2. **Через конфигурацию Synapse:**
   - Если есть доступ к серверу Matrix, создайте токен через Python скрипт
   
3. **Проверьте существующий токен:**
   - На сервере приложения: `grep MATRIX_ADMIN_TOKEN .env.local`
   - В логах: `pm2 logs my-union-pro | grep -i matrix`

## Важно

- `MATRIX_ADMIN_TOKEN` критически важен для создания чатов через admin API
- Без него создание чатов будет падать с ошибкой 500
- Токен должен иметь права администратора на Matrix сервере
