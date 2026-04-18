# MyUnion Storybook

> Обновлено: 15 ноября 2025

## Что сделано в этом спринте
- Полная миграция push-уведомлений с OneSignal на Firebase Cloud Messaging.
- Созданы клиентские модули `lib/firebase-push-notifications.ts` и `components/firebase-push-init.tsx`.
- Добавлен сервис-воркер `public/firebase-messaging-sw.js` и интеграция Firebase Admin SDK на сервере.
- Обновлены API: `/api/chat`, `/api/push/subscribe`, `/api/admin/notifications/send`, `/api/admin/env`.
- Восстановлен и унифицирован дизайн страницы настроек (`/dashboard/settings`).
- Добавлена админ-страница `/admin/settings` с управлением env-переменными и массовыми уведомлениями.

## Firebase Push Notifications
- Конфиг лежит в `lib/firebase-config.ts` (использует значения из `.env(.prod)`):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
  - `NEXT_PUBLIC_FIREBASE_VAPID_PUBLIC_KEY`
- Серверные ключи: `FIREBASE_PRIVATE_KEY` (из `myunion-c3187-firebase-adminsdk-fbsvc-003d6de79e.json`).
- Таблица `PushSubscription` в БД хранит `fcmToken`.

### Проверка уведомлений
1. Авторизоваться пользователем и открыть `/dashboard`.
2. Браузер должен запросить разрешение на уведомления (стандартный prompt).
3. При новом сообщении от бота приходит веб-пуш со звуком.
4. В серверах логирует только ошибки (`lib/firebase-push-notifications.ts`).

## Админ-инструменты
- `/admin/settings` (только `SUPER_ADMIN`):
  - Синхронизирует и редактирует `.env.local`/`.env.prod` (через `/api/admin/env`).
  - Позволяет отправлять массовые push через Firebase.
- Для обновления системных параметров просто редактировать поля и жать «Сохранить настройки».

## Доступ к продакшен-серверу
- Host: `79.143.29.66` (`myunion.pro`)
- SSH: `ssh root@79.143.29.66`
- Пароль: `sAt,8?Bh+Ny_BW`
- Путь к проекту: `/opt/my-union-pro`
- PM2 процесс: `my-union-pro`

## Деплой (manual)
```bash
ssh root@79.143.29.66
cd /opt/my-union-pro
git pull origin main
pnpm install
npx prisma db push --accept-data-loss
npx prisma generate
pnpm build
pm2 restart my-union-pro
pm2 logs my-union-pro --lines 50
```

## Быстрые проверки после деплоя
- ✅ `pnpm build` прошёл без ошибок на сервере.
- ✅ `pm2 list` показывает `my-union-pro` в статусе `online`.
- ✅ В браузере проверяем `/dashboard` и `/dashboard/settings`.
- ✅ Проверка веб-пушей (новое сообщение от бота).

## Полезные ссылки
- Prod: https://myunion.pro
- Local dev: http://localhost:3004
- Репозиторий: https://bitbucket.org/usmanoff/my-union-pro-ai
```
