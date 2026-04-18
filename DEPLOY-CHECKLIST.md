# Деплой и проверки

**Репозиторий:** https://bitbucket.org/usmanoff/my-union-pro-ai
**Прод-сервер:** `79.143.29.66` (Selectel, RU), путь `/opt/my-union-pro`
**БД:** VK Cloud PostgreSQL (`83.166.237.161:5432`), подключение в `.env.local` сервера
**CDN:** VK Cloud (`cdn.myunion.pro` → origin на этот же сервер)
**Доступ:** по SSH-ключу `~/.ssh/myunion_vds` (пароли нигде не храним)

## Быстрый деплой

С локальной машины:

```bash
./deploy.sh           # git fetch на сервере + build + pm2 restart
./deploy.sh --push    # то же, но сначала git push origin main
```

Скрипт читает необязательные env:

- `VDS_HOST` — по умолчанию `79.143.29.66`
- `VDS_SSH_KEY` — по умолчанию `~/.ssh/myunion_vds`
- `VDS_USER` — по умолчанию `root`
- `VDS_PATH` — по умолчанию `/opt/my-union-pro`

## Ручные команды на сервере

```bash
ssh -i ~/.ssh/myunion_vds root@79.143.29.66
cd /opt/my-union-pro
git fetch origin main && git reset --hard origin/main
pnpm install --frozen-lockfile      # если менялся lockfile
pnpm prisma generate
pnpm prisma migrate deploy          # при новых миграциях
rm -rf .next && pnpm build
pm2 restart my-union-pro --update-env
pm2 restart my-union-socket --update-env
pm2 save
pm2 logs my-union-pro --lines 50
```

## Проверка после деплоя

1. `curl -I https://myunion.pro` → `HTTP/2 200`
2. Вход в `/login`, отправка magic link — работает.
3. WebSocket: в консоли браузера `[useChat] ✅ Socket connected`.
4. Админ-аналитика расходов ИИ: `/admin/ai-chat/usage` → события логируются.

## Типовые проблемы

- **502** — приложение не поднялось: `pm2 logs my-union-pro --err`
- **WebSocket не подключается** — проверь `NEXT_PUBLIC_SOCKET_URL` и `pm2 list` (должен быть `my-union-socket` online)
- **Prisma migration not applied** — запусти вручную `pnpm prisma migrate deploy`
- **SSL истёк** — `certbot renew --dry-run` на сервере (certbot уже установлен), после успешного renew `systemctl reload nginx`

## Что делать, если остановился старый сервер

- Если выключается/переезжает прод-сервер: обнови DNS в Cloudflare для
  `myunion.pro`, `www.myunion.pro`, `cdn.myunion.pro` → новый IP.
- После переноса проверь `.env.local` на новом сервере (VDS_HOST, VDS_STORAGE_HOST).
- `/etc/letsencrypt/` копируется rsync'ом со старого, чтобы не терять
  действующий сертификат и не натыкаться на rate-limit Let's Encrypt.
- `public/uploads/` тоже копируются rsync'ом (легче, чем хранить на CDN).
