#!/bin/bash

set -e

echo "🚀 Starting deployment..."
echo ""

# Commit and push
echo "📦 Step 1: Committing changes..."
cd /Users/renatusmanov/my-union-pro-ai
git add -A
git commit -m "Fix: исправления чата, статистики и деплоя" || echo "No changes to commit"
git push
echo "✅ Changes pushed"
echo ""

# Deploy to server
echo "📥 Step 2: Deploying to server..."
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
set -e
cd /opt/my-union-pro

echo "=== Git Pull ==="
git pull
echo ""

echo "=== Installing dependencies ==="
pnpm install
echo ""

echo "=== Building project ==="
pnpm build
echo ""

echo "=== Restarting PM2 ==="
pm2 restart my-union-pro
sleep 2
echo ""

echo "=== PM2 Status ==="
pm2 status
echo ""

echo "=== Recent logs ==="
pm2 logs my-union-pro --lines 10 --nostream
ENDSSH

echo ""
echo "✅ Deployment completed!"
