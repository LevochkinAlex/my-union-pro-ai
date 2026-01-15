#!/bin/bash

set -e

echo "🚀 Starting deployment to production..."
echo ""

cd /Users/renatusmanov/my-union-pro-ai && sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
set -e
cd /opt/my-union-pro

echo "=== Step 1: Git Pull ==="
git pull
echo ""

echo "=== Step 2: Prisma Generate ==="
npx prisma generate
echo ""

echo "=== Step 3: Prisma DB Push (if schema changed) ==="
npx prisma db push --accept-data-loss || echo "Prisma push skipped"
echo ""

echo "=== Step 4: Installing dependencies ==="
pnpm install
echo ""

echo "=== Step 5: Building project ==="
pnpm build
echo ""

echo "=== Step 6: Restarting PM2 ==="
pm2 restart my-union-pro
sleep 2
echo ""

echo "=== Step 7: PM2 Status ==="
pm2 status
echo ""

echo "=== Step 8: Recent logs ==="
pm2 logs my-union-pro --lines 20 --nostream
echo ""

echo "✅ Deployment completed!"
ENDSSH

echo ""
echo "✨ Deployment finished!"
