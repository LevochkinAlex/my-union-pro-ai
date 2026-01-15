#!/bin/bash

set -e

SERVER="root@194.87.49.210"
PASSWORD="wu,iMrZj6goZh?"
PROJECT_DIR="/opt/my-union-pro"

echo "🚀 Starting full deployment..."
echo ""

sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" << 'ENDSSH'
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
ENDSSH

echo ""
echo "✨ Full deployment finished!"
