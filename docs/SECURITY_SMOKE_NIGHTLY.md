# Security Smoke (RBAC, runtime)

Скрипт: `scripts/security-role-runtime-smoke.mjs`. Запуск: `pnpm test:security:runtime`.

Репозиторий кода находится на **GitHub** (организация [myunion-pro](https://github.com/myunion-pro)). Автоматический CI для ночного смока можно настроить через **GitHub Actions** или запускать смок **локально**/на выделенной машине с теми же переменными окружения, что перечислены ниже.

## Переменные для CI (GitHub Actions и т.п.)

При падении тестов в лог пишется предупреждение; для строгого режима см. `SEC_SMOKE_STRICT` в скрипте. POST заседаний в безопасном режиме CI можно отключить: `SEC_SMOKE_SKIP_MEETINGS_POST=1`.

Локально полный прогон, включая POST meetings (осторожно, создаёт заседание):

```bash
pnpm test:security:runtime
```

Исходник проверок: `scripts/security-role-runtime-smoke.mjs`.

Runtime regression checks for critical role guards:

- `GET /api/ppo-head/reports` -> `200/403`
- `GET /api/ppo-head/appeals` -> `200/403`
- `GET /api/ppo-head/chats` -> `200/403`
- `POST /api/ppo-head/meetings` -> `201/403`

## Local run

```bash
pnpm test:security:runtime
```

By default, missing env vars skip checks.  
For strict mode (fail on missing env):

```bash
SEC_SMOKE_STRICT=1 pnpm test:security:runtime
```

Если `SEC_SMOKE_BASE_URL` не задан, job можно пропустить.  
Для прогона смока задай секреты/variables в CI (GitHub Secrets, и т. п.):

- `SEC_SMOKE_BASE_URL` (for example: `https://myunion.pro`)
- `SEC_SMOKE_COOKIE_REPORTS_ALLOW`
- `SEC_SMOKE_COOKIE_REPORTS_DENY`
- `SEC_SMOKE_COOKIE_APPEALS_ALLOW`
- `SEC_SMOKE_COOKIE_APPEALS_DENY`
- `SEC_SMOKE_COOKIE_CHATS_ALLOW`
- `SEC_SMOKE_COOKIE_CHATS_DENY`
- `SEC_SMOKE_COOKIE_MEETINGS_ALLOW_CREATE`
- `SEC_SMOKE_COOKIE_MEETINGS_DENY_CREATE`

## Cookie format

Use full `Cookie` header value as a secret, for example:

```text
next-auth.session-token=...; __Secure-next-auth.session-token=...
```
