#!/usr/bin/env bash
#
# После простоя PostgreSQL / CDN: переподнять PM2 (новый пул Prisma), проверить API.
# Запускать НА СЕРВЕРЕ из корня репозитория:
#   cd /opt/my-union-pro && pnpm run vds:recover
#
# Опции:
#   --migrate   выполнить prisma migrate deploy (перед рестартом), берёт .env из .env.production | .env.local | .env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

RUN_MIGRATE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --migrate)
      RUN_MIGRATE=1
      shift
      ;;
    *)
      echo "Неизвестный аргумент: $1 (доступно: --migrate)" >&2
      exit 1
      ;;
  esac
done

PM2_APP="${PM2_APP_NAME:-my-union-pro}"
PM2_SOCKET="${PM2_SOCKET_NAME:-my-union-socket}"

pick_env_file() {
  for f in .env.production .env.local .env; do
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

if [[ "$RUN_MIGRATE" -eq 1 ]]; then
  ENV_FILE="$(pick_env_file || true)"
  if [[ -n "${ENV_FILE:-}" ]]; then
    echo "=== prisma migrate deploy ($ENV_FILE) ==="
    pnpm exec dotenv -e "$ENV_FILE" -- prisma migrate deploy
  else
    echo "⚠️  Нет .env.production / .env.local / .env — пропуск migrate. Задайте DATABASE_URL и повторите." >&2
  fi
fi

echo "=== pm2 restart: $PM2_APP ==="
pm2 restart "$PM2_APP"

if pm2 describe "$PM2_SOCKET" &>/dev/null; then
  echo "=== pm2 restart: $PM2_SOCKET ==="
  pm2 restart "$PM2_SOCKET"
else
  echo "($PM2_SOCKET не найден в pm2 — ок)"
fi

sleep 3

LOCAL_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:3004/api/health}"
PUBLIC_URL="${PUBLIC_HEALTH_URL:-https://myunion.pro/api/health}"

curl_health() {
  local name="$1"
  local url="$2"
  echo ""
  echo "=== $name ==="
  echo "GET $url"
  if out="$(curl -sfS -m 30 "$url" 2>&1)"; then
    echo "$out" | head -c 4000
    echo ""
    echo "→ OK"
    return 0
  else
    echo "$out" >&2
    echo "→ ОШИБКА (curl)" >&2
    return 1
  fi
}

FAILED=0
curl_health "health (localhost, обход DNS)" "$LOCAL_URL" || FAILED=1
curl_health "health (публичный HTTPS)" "$PUBLIC_URL" || FAILED=1

if [[ "$FAILED" -ne 0 ]]; then
  echo "" >&2
  echo "Что смотреть: pm2 logs $PM2_APP --lines 80" >&2
  exit 1
fi

echo ""
echo "Готово: приложение перезапущено, health проверки прошли."
