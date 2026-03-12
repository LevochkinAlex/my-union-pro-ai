#!/bin/bash

set -e

# Данные от VDS из env (например: export DEPLOY_SERVER=root@194.87.49.210 DEPLOY_PASSWORD=...)
SERVER="${DEPLOY_SERVER:?Set DEPLOY_SERVER env}"
PASSWORD="${DEPLOY_PASSWORD:?Set DEPLOY_PASSWORD env}"
PROJECT_DIR="${DEPLOY_PROJECT_DIR:-/opt/my-union-pro}"

echo "🚀 Starting full deployment..."
echo ""

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" 'set -e
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
