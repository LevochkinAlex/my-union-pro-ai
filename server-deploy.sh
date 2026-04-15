#!/bin/bash
cd /opt/my-union-pro

echo "=== Current commit ==="
git log -1 --oneline
echo ""

echo "=== Git status ==="
git status --short
echo ""

echo "=== Pulling latest changes ==="
git pull origin main
echo ""

echo "=== Installing dependencies ==="
pnpm install
echo ""

echo "=== Building project ==="
pnpm build
echo ""

echo "=== Restarting PM2 ==="
pm2 restart my-union-pro
sleep 3
echo ""

echo "=== PM2 Status ==="
pm2 status
echo ""

echo "=== Recent logs ==="
pm2 logs my-union-pro --lines 10 --nostream
