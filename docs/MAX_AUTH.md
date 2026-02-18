# Вход через MAX (мини-приложение)

Пользователи могут войти в МойСоюз через мини-приложение в мессенджере MAX. После одобрения чат-бота в [платформе MAX для партнёров](https://business.max.ru/self) нужно подключить мини-приложение и указать токен бота.

## Настройка

### 1. Токен бота

В `.env.local` задайте переменную:

```bash
MAX_BOT_TOKEN=ваш_токен_бота
```

Токен берётся в платформе MAX для партнёров: **Интеграция** → **Получить токен**.

### 2. URL мини-приложения в MAX

В платформе MAX для партнёров: **Чат-бот и мини-приложение** → **Настроить** → поле **«Введите ссылку»**:

- **Прод:** `https://myunion.pro/auth/max`
- **Локально (тест):** например `https://ваш-ngrok-или-туннель.ngrok.io/auth/max` (обязательно HTTPS)

Выберите кнопку открытия (например, «Открыть») и нажмите **Сохранить**.

### 3. Миграция БД

В схеме Prisma добавлено поле `maxUserId` у модели `User`. Выполните:

```bash
pnpm prisma migrate dev --name add_max_user_id
```

На проде: `pnpm prisma migrate deploy`.

## Как это работает

1. Пользователь в MAX открывает чат с ботом МойСоюз и нажимает кнопку мини-приложения.
2. Открывается страница `https://myunion.pro/auth/max` во встроенном WebView. MAX Bridge передаёт строку `initData` с данными пользователя и подписью.
3. Страница отправляет `initData` в `POST /api/auth/max/verify`. Сервер проверяет подпись (HMAC-SHA256 по [документации MAX](https://dev.max.ru/docs/webapps/validation)), находит или создаёт пользователя по `user.id` из MAX и выдаёт одноразовый токен входа.
4. Браузер переходит на `/auth/max/success?token=...`, где выполняется вход через NextAuth и редирект в `/dashboard`.

## Документация MAX

- [Подключение мини-приложения](https://dev.max.ru/docs/webapps/introduction)
- [MAX Bridge](https://dev.max.ru/docs/webapps/bridge)
- [Валидация данных](https://dev.max.ru/docs/webapps/validation)
- [Выбор сервисов](https://dev.max.ru/docs/maxbusiness/selectionservices)
