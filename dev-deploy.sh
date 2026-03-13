#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  while IFS= read -r line; do
    [[ ! "$line" =~ ^(DEPLOY_SERVER|DEPLOY_PASSWORD|VDS_HOST|VDS_PASSWORD)= ]] && continue
    export "$line"
  done < "$SCRIPT_DIR/.env"
fi
strip_quotes() { echo "$1" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
[ -n "$VDS_HOST" ] && [ -z "$DEPLOY_SERVER" ] && export DEPLOY_SERVER="root@$(strip_quotes "$VDS_HOST")"
[ -n "$VDS_PASSWORD" ] && [ -z "$DEPLOY_PASSWORD" ] && export DEPLOY_PASSWORD="$(strip_quotes "$VDS_PASSWORD")"

SERVER="${DEPLOY_SERVER:?Set DEPLOY_SERVER or VDS_HOST in .env}"
PASSWORD="${DEPLOY_PASSWORD:?Set DEPLOY_PASSWORD env}"

echo "🚀 Starting DEV deployment (dev.myunion.pro)..."
echo ""

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" 'set -e
cd /opt/my-union-pro-dev

echo "=== Step 1: Git (checkout dev, pull) ==="
git fetch origin dev
git checkout dev
git pull origin dev
echo ""

echo "=== Step 2: Installing dependencies ==="
pnpm install
echo ""

echo "=== Step 3: Building project ==="
pnpm build
echo ""

echo "=== Step 4: Restarting PM2 ==="
pm2 restart my-union-pro-dev
echo ""

echo "=== Step 5: PM2 Status ==="
pm2 status
echo ""

echo "=== Step 6: Recent logs ==="
pm2 logs my-union-pro-dev --lines 10 --nostream
echo ""

echo "✅ DEV deployment completed!"
'

echo ""
echo "✨ Dev deployment finished!"
