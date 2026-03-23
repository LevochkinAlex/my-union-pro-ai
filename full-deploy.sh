#!/bin/bash

set -e

# Подхват только переменных деплоя из .env (без source всего файла)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  while IFS= read -r line; do
    [[ ! "$line" =~ ^(DEPLOY_SERVER|DEPLOY_PASSWORD|VDS_HOST|VDS_PASSWORD)= ]] && continue
    export "$line"
  done < "$SCRIPT_DIR/.env"
fi
# Убираем кавычки из значений, прочитанных из .env
strip_quotes() { echo "$1" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
[ -n "$VDS_HOST" ] && [ -z "$DEPLOY_SERVER" ] && export DEPLOY_SERVER="root@$(strip_quotes "$VDS_HOST")"
[ -n "$VDS_PASSWORD" ] && [ -z "$DEPLOY_PASSWORD" ] && export DEPLOY_PASSWORD="$(strip_quotes "$VDS_PASSWORD")"

# Данные от VDS из env (или из .env)
SERVER="${DEPLOY_SERVER:?Set DEPLOY_SERVER or VDS_HOST in .env}"
PASSWORD="${DEPLOY_PASSWORD:?Set DEPLOY_PASSWORD env}"
PROJECT_DIR="${DEPLOY_PROJECT_DIR:-/opt/my-union-pro}"

echo "🚀 Starting full deployment..."
echo ""

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=120 \
  "$SERVER" 'set -e
cd /opt/my-union-pro

echo "=== Step 1: Git Pull ==="
git pull
echo ""

echo "=== Step 2: Installing dependencies ==="
pnpm install
echo ""

echo "=== Step 3: Building project ==="
pnpm build
echo ""

echo "=== Step 4: Restarting PM2 ==="
pm2 restart my-union-pro
echo ""

echo "=== Step 5: PM2 Status ==="
pm2 status
echo ""

echo "=== Step 6: Recent logs ==="
pm2 logs my-union-pro --lines 10 --nostream
echo ""

echo "✅ Deployment completed!"
'

echo ""
echo "✨ Full deployment finished!"
