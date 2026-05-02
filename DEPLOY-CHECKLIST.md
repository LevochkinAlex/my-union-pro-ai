# Деплой и проверки

**Репозиторий (единственный источник кода):** https://github.com/myunion-pro/my-union-pro-ai  
**SSH clone / remote:** `git@github.com:myunion-pro/my-union-pro-ai.git`

**Один раз владельцу организации [myunion-pro](https://github.com/myunion-pro):** создать **пустой** приватный репозиторий `my-union-pro-ai` (без README и лицензии), выдать доступ разработчикам и при необходимости добавить **Deploy key** с публичной частью ключа VDS (`myunion_vds`).

**Прод-сервер:** `79.143.29.66` (Selectel, RU), путь `/opt/my-union-pro`
**БД:** VK Cloud PostgreSQL (`83.166.237.161:5432`), подключение в `.env.local` сервера
**CDN:** VK Cloud (`cdn.myunion.pro` → origin на этот же сервер)
**Доступ:** по SSH-ключу `~/.ssh/myunion_vds` (пароли нигде не храним)

### GitHub CLI (`gh`) — один аккаунт для работы с MyUnion

У **`gh` нет входа «в организацию»**: авторизуется только **пользователь GitHub**, у которого есть доступ к org **[myunion-pro](https://github.com/myunion-pro)** (рабочий аккаунт компании, сервисная учётка или отдельный бот — как договоритесь в команде).

Рекомендуемая политика:

1. На машине держать в `gh` **не больше одной** активной учётной записи на `github.com`:
   - `gh auth status`
   - выйти из лишней: **`gh auth logout -h github.com -u ЛИШНИЙ_ЛОГИН`**
   - либо несколько раз **`gh auth logout`**, затем один раз **`gh auth login`** только под нужным пользователем.
2. Убедиться, что у этой учётки есть доступ к org: например **`gh api user/orgs -q '.[].login'`** — в списке должна быть **`myunion-pro`** (для членов организации).
3. Личные GitHub-аккаунты на той же машине удобнее вести через **`git` + отдельный Host в `~/.ssh/config`** (например `github.com-myunion` vs `github.com`), а **`gh` оставить только под MyUnion** — так не путаются контексты и токены.

## Быстрый деплой

Локально **`origin` = GitHub**. Скрипт **`./deploy.sh --push`** выполняет **`git push origin main`**, на VDS подтягивает тот же **`origin/main`**.

```bash
./deploy.sh           # на VDS: fetch + reset на origin/main + build + pm2 + crontab
./deploy.sh --push    # сначала git push origin main, затем как выше
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

### Почему SSH «есть», а `git push` пишет Repository not found?

- **SSH только подтверждает доступ к аккаунту GitHub**, к которому привязан ключ (в логах: `Hi username!`). Это **не создаёт репозиторий** само по себе.
- Нужно, чтобы в организации **`myunion-pro`** существовал репозиторий **`my-union-pro-ai`** (пустой или с кодом), и чтобы **этот аккаунт или Deploy key имели право push/pull**.
- Проверка:

```bash
GIT_SSH_COMMAND="ssh -o BatchMode=yes" git ls-remote git@github.com:myunion-pro/my-union-pro-ai.git refs/heads/main
```

— должен вывести хеш коммита, а не ошибку.

**Первый push истории после создания пустого репозитория:**

```bash
git remote set-url origin git@github.com:myunion-pro/my-union-pro-ai.git
git push -u origin main
git push origin --tags   # при необходимости
```

**Bitbucket** в проектной документации больше не используется. Старое зеркало при желании можно держать у себя вручную как отдельный remote (не входит в стандартный поток деплоя).

## VDS: переключить `origin` на GitHub и подтянуть код

Подключитесь по SSH (ключ `~/.ssh/myunion_vds`). На сервер GitHub должен пускать тот же ключ (**Deploy key** с доступом записи или доступ организации для серверного пользователя по SSH).

```bash
cd /opt/my-union-pro
git remote -v
git remote set-url origin git@github.com:myunion-pro/my-union-pro-ai.git
git fetch origin main
git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate deploy
rm -rf .next && pnpm build
pm2 restart my-union-pro --update-env
pm2 restart my-union-socket --update-env
pm2 save
```

Дальше деплой только через `./deploy.sh` с локальной машины (он делает `git fetch` и `reset --hard origin/main` на проде).

## Ручные команды на сервере (повтор операций deploy без `./deploy.sh`)

```bash
ssh -i ~/.ssh/myunion_vds root@79.143.29.66
cd /opt/my-union-pro
git remote -v   # origin → git@github.com:myunion-pro/my-union-pro-ai.git
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
5. **BestBenefits (каталог):** на VDS в `.env.local` должны быть явные строки `BEST_BENEFITS_API_URL` и `BESTBENEFITS_CATALOG_MAX_PAGES` — после синхронизации кода (`git fetch` / `reset`): **`bash scripts/ensure-vds-bb-catalog-env.sh`** (или вручную по `.env.example`). Затем проверка:  
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
