# Деплой и проверки

**Репозиторий:** https://bitbucket.org/usmanoff/my-union-pro-ai
**Прод-сервер:** `79.143.29.66` (Selectel, RU), путь `/opt/my-union-pro`
**БД:** VK Cloud PostgreSQL (`83.166.237.161:5432`), подключение в `.env.local` сервера
**CDN:** VK Cloud (`cdn.myunion.pro` → origin на этот же сервер)
**Доступ:** по SSH-ключу `~/.ssh/myunion_vds` (пароли нигде не храним)

## Быстрый деплой

С локальной машины:

```bash
./deploy.sh           # git fetch на сервере + build + pm2 restart + root crontab (скидки + ЕГРЮЛ партнёры)
./deploy.sh --push    # то же, но сначала git push origin main
```

После `./deploy.sh` на сервере от **root** автоматически выполняется `APP_ROOT=$VDS_PATH bash scripts/setup-cron.sh`. Все три задания идут в **`CRON_TZ=UTC`**: ЕГРЮЛ партнёров — **`0 2 * * *`** (02:00 UTC ≈ 05:00 МСК).

На **localhost** по расписанию ничего не крутится (нет серверного crontab): проверка вручную — `npm run cron:partner-liquidation`.

### Cron ЕГРЮЛ: если «не срабатывает»

1. **Запись в crontab (root):** после `./deploy.sh` вызывается `setup-cron.sh`. Если деплой не под root — один раз:  
   `APP_ROOT=/opt/my-union-pro bash /opt/my-union-pro/scripts/setup-cron.sh`  
   Проверка: `crontab -l` — строка с `run-partner-liquidation-cron.ts` и блок `# --- MYUNION_CRON`.
2. **Переменные:** в `/opt/my-union-pro` нужны **`.env.local`** (и при необходимости `.env`) с **`DATABASE_URL`**. В crontab для tsx-заданий вызывается **`dotenv -c`** (каскад как у Next), плюс в коде остаётся **`scripts/load-env-local-first.ts`** при ручном `tsx` без обёртки.
3. **Логи и ручной прогон:** `tail -50 /var/log/myunion/partner-liquidation.log`; вручную (как в crontab, с каскадом env):  
   `cd /opt/my-union-pro && ./node_modules/.bin/dotenv -c -- /usr/bin/node ./node_modules/tsx/dist/cli.mjs scripts/run-partner-liquidation-cron.ts`
4. **Время:** **`CRON_TZ=UTC`**, слот **`0 2 * * *`** = 02:00 UTC ≈ 05:00 МСК (не путать с локальным TZ сервера).

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
5. **BestBenefits (каталог):** на VDS в `.env.local` должны быть явные строки `BEST_BENEFITS_API_URL` и `BESTBENEFITS_CATALOG_MAX_PAGES` — после `git pull` с локальной машины: **`bash scripts/ensure-vds-bb-catalog-env.sh`** (или вручную по `.env.example`). Затем проверка:  
   `cd /opt/my-union-pro && ./node_modules/.bin/dotenv -c -- ./node_modules/.bin/tsx scripts/check-bb-org-token.ts` → **HTTP 200**; полный импорт каталога: `tsx scripts/sync-discounts.ts`. Подробнее: `docs/BESTBENEFITS_SYSTEM.md`.

## Типовые проблемы

- **PDF повестки/протокола заседания профкома (500)** — на ВДС нет Chrome для Puppeteer. Один раз: `cd /opt/my-union-pro && npx puppeteer browsers install chrome` (или положите системный Chromium и задайте `PUPPETEER_EXECUTABLE_PATH` в `.env.local`). Скрипт `./deploy.sh` сам ставит браузер, если его ещё нет.
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
