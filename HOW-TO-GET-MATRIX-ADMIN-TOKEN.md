# Как получить MATRIX_ADMIN_TOKEN

## Вариант 1: Через API Matrix (рекомендуется)

Если у вас есть доступ к Matrix серверу (`https://matrix.myunion.pro`), вы можете создать токен администратора через API:

### Шаг 1: Получите access token администратора

Сначала нужно войти как администратор Matrix:

```bash
curl -X POST https://matrix.myunion.pro/_matrix/client/v3/login \
  -H "Content-Type: application/json" \
  -d '{
    "type": "m.login.password",
    "user": "@admin:matrix.myunion.pro",
    "password": "ваш_пароль_администратора"
  }'
```

Ответ будет содержать `access_token` - это временный токен для сессии.

### Шаг 2: Создайте постоянный access token через Admin API

Используя полученный `access_token`, создайте постоянный токен:

```bash
curl -X POST https://matrix.myunion.pro/_synapse/admin/v1/users/@admin:matrix.myunion.pro/access_token \
  -H "Authorization: Bearer ВАШ_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "valid_until_ms": null
  }'
```

Где `ВАШ_ACCESS_TOKEN` - это токен, полученный на шаге 1.

Ответ будет содержать `access_token` - это и есть ваш `MATRIX_ADMIN_TOKEN`.

---

## Вариант 2: Через конфигурацию Synapse (если есть доступ к серверу)

Если у вас есть SSH доступ к серверу, где установлен Synapse:

### Шаг 1: Найдите конфигурацию Synapse

Обычно конфигурация находится в:
- `/etc/synapse/homeserver.yaml`
- `/var/lib/synapse/homeserver.yaml`
- `~/.synapse/homeserver.yaml`

### Шаг 2: Проверьте секцию `registration_shared_secret`

В файле `homeserver.yaml` найдите секцию с токенами или создайте новый токен через скрипт:

```bash
# На сервере Synapse
cd /path/to/synapse
source env/bin/activate  # если используется виртуальное окружение
python -m synapse.app.homeserver --generate-config --server-name matrix.myunion.pro
```

### Шаг 3: Создайте токен через Python скрипт

Создайте файл `generate_token.py`:

```python
from synapse.api.auth import Auth
from synapse.config.homeserver import HomeServerConfig
from synapse.server import HomeServer
import yaml

# Загрузите конфигурацию
with open('/path/to/homeserver.yaml', 'r') as f:
    config = yaml.safe_load(f)

# Создайте HomeServer объект
hs = HomeServer(config['server_name'], config)

# Создайте токен для администратора
admin_user_id = '@admin:matrix.myunion.pro'
token = hs.get_auth().generate_access_token(admin_user_id)

print(f"Access Token: {token}")
```

---

## Вариант 3: Использовать существующий токен (если он уже был создан)

Если токен уже был создан ранее, он может быть:

1. **В переменных окружения на сервере приложения:**
   ```bash
   ssh root@194.87.49.210
   cd /opt/my-union-pro
   grep MATRIX_ADMIN_TOKEN .env.local
   ```

2. **В конфигурации Synapse:**
   ```bash
   # На сервере Matrix
   grep -r "access_token\|admin_token" /etc/synapse/
   ```

3. **В логах приложения:**
   ```bash
   # На сервере приложения
   pm2 logs my-union-pro | grep -i matrix
   ```

---

## Вариант 4: Создать через веб-интерфейс (если настроен)

Если у вас настроен веб-интерфейс для управления Synapse (например, через Element или другой клиент):

1. Войдите как администратор
2. Перейдите в настройки → Advanced → Access Tokens
3. Создайте новый токен с правами администратора
4. Скопируйте токен

---

## После получения токена

Добавьте токен в `.env.local` на сервере приложения:

```bash
ssh root@194.87.49.210
cd /opt/my-union-pro
nano .env.local
```

Добавьте строку:
```
MATRIX_ADMIN_TOKEN=ваш_полученный_токен
```

Сохраните файл и перезапустите приложение:
```bash
pm2 restart my-union-pro
```

---

## Проверка токена

Проверить, что токен работает, можно так:

```bash
curl -X GET https://matrix.myunion.pro/_matrix/client/v3/account/whoami \
  -H "Authorization: Bearer ВАШ_MATRIX_ADMIN_TOKEN"
```

Если токен валиден, вы получите информацию о пользователе.

---

## Важно

- `MATRIX_ADMIN_TOKEN` должен иметь права администратора на Matrix сервере
- Токен должен быть постоянным (не истекать)
- Храните токен в безопасности - он дает полный доступ к Matrix серверу
- Не коммитьте токен в git - используйте `.env.local` (который в `.gitignore`)
