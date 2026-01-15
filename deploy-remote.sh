#!/bin/bash
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
echo ""
echo "=== PM2 Status ==="
pm2 status
echo ""
echo "=== Recent logs ==="
pm2 logs my-union-pro --lines 10 --nostream
