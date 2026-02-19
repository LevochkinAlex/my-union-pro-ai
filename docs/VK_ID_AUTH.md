# Вход через VK ID

[VK ID](https://id.vk.com/) — единый аккаунт для входа через ВКонтакте, Одноклассники или Mail. Подключение бесплатное, без договора.

## 1. Создание приложения в VK ID

1. Перейдите в [кабинет VK ID для бизнеса](https://id.vk.com/about/business/go).
2. Создайте приложение типа **Web app**.
3. На шаге **«Registration info»** (Step 2 of 4):
   - **Base domain:** `myunion.pro` (уже указан).
   - **Trusted redirect URL:** укажите ровно:
     ```
     https://myunion.pro/api/auth/vk-id/callback
     ```
   - Нажмите «Add trusted redirect URL», затем «Create app».
4. После создания приложения скопируйте **идентификатор приложения** (Client ID / App ID) из параметров приложения.

## 2. Настройка в проекте

В `.env` (или `.env.local`) добавьте:

```bash
VK_ID_CLIENT_ID=ваш_идентификатор_приложения
```

Для локальной разработки в настройках приложения VK ID добавьте второй Trusted redirect URL:

```
http://localhost:3004/api/auth/vk-id/callback
```

(замените порт на тот, на котором запущен проект).

## 3. Миграция БД

В модель `User` добавлено поле `vkId`. Выполните:

```bash
pnpm prisma migrate deploy
```

(локально: `pnpm prisma migrate dev --name add_vk_id`).

## 4. Как это работает

1. Пользователь на странице входа нажимает **«Войти с VK ID»**.
2. Редирект на `id.vk.ru` (форма VK ID), пользователь входит через ВК / ОК / Mail.
3. VK ID перенаправляет на `https://myunion.pro/api/auth/vk-id/callback?code=...&state=...&device_id=...`.
4. Сервер обменивает код на токены (OAuth 2.1 + PKCE), запрашивает данные пользователя, находит или создаёт запись в БД, выдаёт одноразовый токен входа и перенаправляет в личный кабинет.

## Документация VK ID

- [OAuth VK ID](https://id.vk.com/about/business/go/docs/ru/vkid/latest/oauth-vk)
- [Справочник API](https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description)
