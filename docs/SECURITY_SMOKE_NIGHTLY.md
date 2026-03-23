# Nightly Security Smoke (RBAC)

**Расписание отключено:** автоматический ночной запуск в workflow закомментирован (cookie-секреты протухают). Запуск только вручную: GitHub Actions → Nightly Security Smoke → Run workflow.

**GitHub Actions:** без `pnpm install` — только Node 20 и `node --test scripts/security-role-runtime-smoke.mjs`. Шаг **всегда завершается успешно** (`exit 0`): при падении тестов в лог пишется `::warning::`, но workflow **не краснеет** (нет ложных алертов из‑за протухших cookie). POST заседаний в CI отключён: `SEC_SMOKE_SKIP_MEETINGS_POST=1`.

Локально полный прогон, включая POST meetings (осторожно, создаёт заседание):

```bash
# без skip — нужны все cookie-секреты
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

## Required secrets for GitHub Actions

If `SEC_SMOKE_BASE_URL` is not set, the nightly job is **skipped** (no failed run).  
To run the smoke, set these repository secrets:

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
