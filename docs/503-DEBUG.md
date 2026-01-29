# Отладка 503 на дашборде и _rsc-запросах

503 на дашборде чаще всего приходят по **RSC-запросам** (React Server Components). Источники: таймауты upstream (nginx → Next.js), нагрузка, ошибки БД при рендере. Ниже — как собрать логи и проверить маршруты.

## 1. Логирование 503 в приложении (Next.js)

При ошибке во время рендера (в т.ч. RSC) срабатывает **instrumentation** `onRequestError`. В stdout (PM2) пишется блок:

- **URL/path** — путь запроса
- **Заголовки** — только безопасные (RSC, Next-Router-Prefetch, Referer, User-Agent и т.п., без cookie)
- **Стек** — первые 15 строк `error.stack`
- **Контекст** — `routeType` (render/route/action), `renderSource` (react-server-components и т.д.)

**Как искать в логах:**

```bash
# На сервере
pm2 logs my-union-pro --lines 500 | grep -A 50 '\[onRequestError\]'
```

Или по 503:

```bash
grep -B 2 -A 30 '\[onRequestError\]' /root/.pm2/logs/my-union-pro-error.log
```

Пример фрагмента лога:

```json
[onRequestError] {
  "message": "...",
  "path": "/dashboard",
  "method": "GET",
  "headers": { "rsc": "1", "next-router-prefetch": "1", "referer": "https://myunion.pro/dashboard" },
  "context": { "routeType": "render", "renderSource": "react-server-components" },
  "stack": "Error: ...\n    at ..."
}
```

По нему можно понять: какой путь, тип рендера и стек ошибки.

## 2. Логи nginx (503 от upstream)

503 может отдавать **nginx**, если Next.js не успел ответить (таймаут) или упал. Нужен формат лога с URI, статусом и временем ответа upstream.

**Формат для access-лога (в `http` или в `server`):**

```nginx
log_format upstream_debug '$remote_addr - $status $request_time $upstream_response_time '
                          '"$request" $upstream_status $upstream_addr';

access_log /var/log/nginx/myunion-503.log upstream_debug;
```

Или отдельный лог только для 503 (через `map` + `if` или отдельный `location` с `return` и своим `access_log`). Простой вариант — логировать всё в один файл и фильтровать по статусу:

```bash
# На сервере: только строки с 503
grep ' 503 ' /var/log/nginx/access.log
```

Если в формате есть `$request`, `$status`, `$upstream_response_time`, `$upstream_status` — по ним видно URL, наш статус, время ответа бэкенда и статус от Next.js.

**Пример места в конфиге** (файл типа `/etc/nginx/sites-enabled/myunion`):

```nginx
server {
    ...
    # Существующий access_log оставляем как есть, при необходимости добавляем второй с деталями:
    log_format with_upstream '$remote_addr - $status $request_time $upstream_response_time "$request" $upstream_status';
    access_log /var/log/nginx/myunion-access.log with_upstream;
    ...
}
```

После изменений: `nginx -t && systemctl reload nginx`.

**Собрать последние 503 из nginx:**

```bash
grep ' 503 ' /var/log/nginx/myunion-access.log | tail -50
```

Пришлите кусок логов (URL, заголовки при необходимости, стек из PM2) — можно разобрать точечно.

## 3. Проверка маршрутов дашборда

Скрипт дергает основные страницы дашборда и один RSC-подобный запрос (с заголовком `RSC: 1`), выводит статус и время ответа.

**Локально (production URL):**

```bash
BASE_URL=https://myunion.pro node scripts/check-dashboard-routes.mjs
```

**На сервере (localhost к Next.js):**

```bash
cd /opt/my-union-pro
BASE_URL=http://127.0.0.1:3004 node scripts/check-dashboard-routes.mjs
```

Интерпретация:

- **503** — страница/маршрут отдаёт 503 (или nginx по таймауту).
- **0 / ERR** — сетевая ошибка или таймаут до ответа.
- **302** без авторизации — ожидаемо (редирект на логин).
- Большое время ответа (>5–10 с) — риск таймаутов nginx и 503.

## 4. Что проверить на сервере

- **Таймауты nginx:** `proxy_read_timeout`, `proxy_connect_timeout`, `proxy_send_timeout` (например, 300s уже стоят в конфиге).
- **Нагрузка:** `pm2 monit`, нагрузка на БД (медленные запросы в Prisma/PostgreSQL).
- **Ошибки приложения:** `pm2 logs my-union-pro --err` и поиск `[onRequestError]` в stdout.

Если пришлёте кусок логов с 503 (URL, заголовки, стек из PM2 и при возможности строки nginx с `$request` и `$upstream_*`) — можно разобрать причину точечно.
