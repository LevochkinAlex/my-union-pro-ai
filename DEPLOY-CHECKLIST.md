# Деплой и проверки

## Отключение защиты веток (чтобы пушить без PR)

1. Открой: **https://github.com/usmanoffcom/my-union-pro-ai/settings/branches**
2. Для **main** и при необходимости для **dev**: нажми **Edit** или **Delete** правила.
3. Убери **"Require a pull request before merging"** и при необходимости **"Do not allow force pushes"** (для dev, если будешь делать `main:dev`), либо удали правило.
4. Сохрани (**Save changes**).

После этого можно пушить в `main` и при необходимости выровнять dev:  
`git push origin main` и при необходимости `git push origin main:dev --force`.

## Доступ в ветку levochkin (пушить без PR)

Чтобы пользователь (например, Левочкин Алекс) мог сам пушить в ветку **levochkin** без создания PR:

1. **Добавить в коллабораторы** (если ещё не добавлен):  
   **https://github.com/usmanoffcom/my-union-pro-ai/settings/access**  
   → **Add people** → ввести GitHub-логин или email → роль **Write** (или **Maintain**).

2. **Не включать защиту для ветки levochkin**:  
   **https://github.com/usmanoffcom/my-union-pro-ai/settings/branches**  
   → не создавать правило для ветки `levochkin` (или удалить правило, если оно есть).  
   Тогда в ветку смогут пушить все, у кого есть право записи в репозиторий.

3. **Если нужна защита только для main/dev**, а levochkin — без PR:  
   создай правила только для `main` и при необходимости `dev`; ветка `levochkin` останется без правила и доступна для пуша.

Левочкину в репо: клонировать, переключиться на ветку и пушить:
```bash
git clone https://github.com/usmanoffcom/my-union-pro-ai.git
cd my-union-pro-ai
git checkout levochkin
# правки...
git add -A && git commit -m "описание" && git push origin levochkin
```

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
