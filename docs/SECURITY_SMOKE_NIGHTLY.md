# Nightly Security Smoke (RBAC)

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

Set these repository secrets:

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
