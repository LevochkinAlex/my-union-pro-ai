# Деплой и проверки

**Репозиторий:** https://github.com/myunion-pro/my-union-pro-ai (приватный)  
**Clone / origin:** `https://github.com/myunion-pro/my-union-pro-ai.git`

**Прод-сервер:** `79.143.29.66` (Selectel, RU), путь `/opt/my-union-pro`  
**БД:** VK Cloud PostgreSQL (`83.166.237.161:5432`)  
**CDN:** VK Cloud (`cdn.myunion.pro`)  
**Доступ к серверу:** SSH-ключ `~/.ssh/myunion_vds` (пароли нигде не храним)

---

## Быстрый деплой

```bash
./deploy.sh           # на VDS: fetch + reset + build + pm2 + crontab
./deploy.sh --push    # сначала git push origin main, затем как выше
```

После `./deploy.sh` на сервере от root автоматически выполняется `APP_ROOT=$VDS_PATH bash scripts/setup-cron.sh`.

Переменные (все опциональны — есть дефолты):

| Переменная | Дефолт |
|---|---|
| `VDS_HOST` | `79.143.29.66` |
| `VDS_SSH_KEY` | `~/.ssh/myunion_vds` |
| `VDS_USER` | `root` |
| `VDS_PATH` | `/opt/my-union-pro` |

---

## Git: HTTPS + авторизация через токен

Origin везде — **HTTPS**, не SSH:

```
https://github.com/myunion-pro/my-union-pro-ai.git
```

### Локально (macOS)

Авторизация через `gh` — токен хранится в keychain, вводить вручную не нужно:

```bash
gh auth login          # один раз; выбрать HTTPS + браузер
gh auth setup-git      # прописывает gh как git credential helper
```

Проверка:

```bash
gh auth status         # должно показать myunion-pro account
git push origin main   # должно работать без запроса пароля
```

### VDS (`79.143.29.66`)

Токен хранится в `~/.git-credentials` (chmod 600):

```
https://x-token-auth:TOKEN@github.com
```

Credential helper:

```bash
git config --global credential.helper store
```

### Обновление токена (когда истечёт)

1. Создать новый PAT: https://github.com/settings/tokens → Fine-grained → org `myunion-pro`, права: `Contents: Read & Write`
2. **Локально** — повторить `gh auth login` с новым токеном, или обновить в macOS Keychain
3. **На VDS:**
   ```bash
   ssh -i ~/.ssh/myunion_vds root@79.143.29.66
   printf 'https://x-token-auth:НОВЫЙ_ТОКЕН@github.com\n' > ~/.git-credentials
   chmod 600 ~/.git-credentials
   git -C /opt/my-union-pro fetch origin main   # проверка
   ```

---

## GitHub CLI (`gh`) — только org myunion-pro

У `gh` нет входа «в организацию»: авторизуется **пользователь**, у которого есть доступ к org **myunion-pro**.

**Убрать старые сессии и оставить одну рабочую:**

```bash
gh auth status                        # смотрим что залогинено
gh auth logout -h github.com -u ЛОГИН # выйти из лишних
gh auth login                         # войти нужным пользователем
gh api user/orgs -q '.[].login'       # myunion-pro должна быть в списке
```

**Личный GitHub на той же машине:** для личных репо — отдельный `Host` в `~/.ssh/config` со своим ключом. `gh` и push в `myunion-pro/*` — всегда от рабочей учётки.

---

## Cron ЕГРЮЛ: если «не срабатывает»

1. **Запись в crontab (root):** `./deploy.sh` вызывает `setup-cron.sh`. Если деплой не под root:
   ```bash
   APP_ROOT=/opt/my-union-pro bash /opt/my-union-pro/scripts/setup-cron.sh
   ```
   Проверка: `crontab -l` — строка с `run-partner-liquidation-cron.ts` и блок `# --- MYUNION_CRON`.

2. **Переменные:** в `/opt/my-union-pro` нужны `.env.local` с `DATABASE_URL`. В crontab для tsx-заданий вызывается `dotenv -c`.

3. **Логи и ручной прогон:**
   ```bash
   tail -50 /var/log/myunion/partner-liquidation.log
   cd /opt/my-union-pro && ./node_modules/.bin/dotenv -c -- /usr/bin/node ./node_modules/tsx/dist/cli.mjs scripts/run-partner-liquidation-cron.ts
   ```

4. **Время:** `CRON_TZ=UTC`, слот `0 2 * * *` = 02:00 UTC ≈ 05:00 МСК.

---

## Ручные команды на сервере

```bash
ssh -i ~/.ssh/myunion_vds root@79.143.29.66
cd /opt/my-union-pro
git remote -v   # origin → https://github.com/myunion-pro/my-union-pro-ai.git
git fetch origin main && git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate deploy
rm -rf .next && pnpm build
pm2 restart my-union-pro --update-env
pm2 restart my-union-socket --update-env
pm2 save
pm2 logs my-union-pro --lines 50
```

---

## Проверка после деплоя

1. `curl -I https://myunion.pro` → `HTTP/2 200`
2. Вход в `/login`, отправка magic link — работает.
3. WebSocket: в консоли браузера `[useChat] ✅ Socket connected`.
4. Админ-аналитика расходов ИИ: `/admin/ai-chat/usage` → события логируются.
5. **BestBenefits (каталог):** после синхронизации кода запустить:
   ```bash
   bash scripts/ensure-vds-bb-catalog-env.sh
   ```
   Проверка: `./node_modules/.bin/dotenv -c -- ./node_modules/.bin/tsx scripts/check-bb-org-token.ts` → HTTP 200.

---

## Типовые проблемы

| Симптом | Причина / решение |
|---|---|
| `git push` → 401 / `could not read Username` | Токен истёк или не настроен — см. раздел «Обновление токена» выше |
| PDF повестки/протокола → 500 | Нет Chrome для Puppeteer. `./deploy.sh` ставит его сам; вручную: `npx puppeteer browsers install chrome` |
| 502 | Приложение не поднялось: `pm2 logs my-union-pro --err` |
| WebSocket не подключается | Проверь `NEXT_PUBLIC_SOCKET_URL` и `pm2 list` (`my-union-socket` online?) |
| Prisma migration not applied | `pnpm prisma migrate deploy` |
| SSL истёк | `certbot renew --dry-run` → `systemctl reload nginx` |

## Что делать, если остановился сервер

- Обнови DNS в Cloudflare для `myunion.pro`, `www.myunion.pro`, `cdn.myunion.pro` → новый IP.
- После переноса проверь `.env.local` на новом сервере.
- `/etc/letsencrypt/` — копируй rsync'ом, чтобы не терять сертификат.
- `public/uploads/` — тоже rsync'ом.
