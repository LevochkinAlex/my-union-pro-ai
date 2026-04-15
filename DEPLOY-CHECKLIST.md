# Деплой и проверки

**Репозиторий (приватный):** https://bitbucket.org/usmanoff/my-union-pro-ai

## Отключение защиты веток (чтобы пушить без PR)

В **Bitbucket Cloud**: репозиторий → **Repository settings** → **Branch restrictions** (ограничения веток).

1. Открой список правил для нужной ветки (**main**, **dev** и т.д.).
2. Удали правило или отредактируй: сними требование pull request / запрет прямого пуша, если нужно пушить в ветку без PR.
3. Сохрани изменения.

После этого можно пушить в `main` и при необходимости выровнять dev:  
`git push origin main` и при необходимости `git push origin main:dev --force`.

## Доступ в ветку levochkin (пушить без PR)

Чтобы пользователь мог сам пушить в ветку **levochkin** без создания PR:

1. **Дать доступ к репозиторию:** **Repository settings** → **User and group access** → добавить пользователя с ролью **Write** (или выше).
2. **Не включать жёсткие ограничения для `levochkin`:** в **Branch restrictions** не создавай отдельное правило, которое требует PR для этой ветки (или удали такое правило).
3. **Если защита нужна только для main/dev**, создай ограничения только для `main` и при необходимости `dev`; ветка `levochkin` останется без лишних требований.

Клонирование и работа с веткой:

```bash
git clone https://bitbucket.org/usmanoff/my-union-pro-ai.git
cd my-union-pro-ai
git checkout levochkin
# правки...
git add -A && git commit -m "описание" && git push origin levochkin
```

(SSH: `git clone git@bitbucket.org:usmanoff/my-union-pro-ai.git`)

## VDS: смена remote с GitHub на Bitbucket (один раз)

На сервере в каталоге проекта:

```bash
cd /opt/my-union-pro
git remote -v
git remote set-url origin git@bitbucket.org:usmanoff/my-union-pro-ai.git
# или HTTPS с app password:
# git remote set-url origin https://bitbucket.org/usmanoff/my-union-pro-ai.git
git fetch origin
git branch -u origin/main main   # при необходимости
```

Убедись, что на VDS настроен доступ: **SSH-ключ** в Bitbucket (Personal settings → SSH keys) или **HTTPS + app password** (Repository → Clone → используй учётные данные с паролем приложения).

## Актуальные скрипты

| Скрипт | Назначение |
|--------|------------|
| **complete-deploy.sh** | Основной деплой: коммит, пуш, pull на сервере, build, restart PM2, проверка API. Запуск: `VDS_PASSWORD='...' ./complete-deploy.sh "Сообщение коммита"` |
| **commit-and-deploy.sh** | Полный деплой с pre-deploy, миграциями Prisma и перезапуском my-union-pro + my-union-socket. Запуск: `VDS_PASSWORD='...' ./commit-and-deploy.sh "Сообщение"` |
| **check-deploy-status.sh** | Только проверка: PM2, последний коммит, git status, наличие .next, HTTP myunion.pro. Запуск: `VDS_PASSWORD='...' ./check-deploy-status.sh` |

Пароль не хранить в репозитории: `export VDS_PASSWORD='...'` перед запуском.

- Сервер: **194.87.49.210**
- Путь на сервере: **/opt/my-union-pro**
- БД: **VK Cloud** (PostgreSQL), в `.env.local` на сервере задан `DATABASE_URL`

## Ручные команды на сервере

```bash
ssh root@194.87.49.210
cd /opt/my-union-pro
git pull origin main
pnpm install
npx prisma migrate deploy   # при необходимости
pnpm build
pm2 restart my-union-pro
pm2 restart my-union-socket
pm2 logs my-union-pro --lines 50
```

## Проверка после деплоя

1. **Сайт:** https://myunion.pro — открывается, логин работает.
2. **WebSocket:** в консоли браузера есть `[useChat] ✅ Socket connected`; сообщения приходят в реальном времени.
3. **Push:** отправить сообщение с одного устройства — на другом приходит уведомление; клик открывает нужный чат.
4. **Логи:** `ssh root@194.87.49.210 'pm2 logs my-union-pro --lines 100'`

## Возможные проблемы

- **502:** приложение не поднялось после build — смотреть `pm2 logs my-union-pro --err`.
- **WebSocket не подключается:** проверить `NEXT_PUBLIC_SOCKET_URL`, что my-union-socket запущен.
- **Миграции:** при изменении схемы Prisma на сервере выполнить `npx prisma migrate deploy`.
