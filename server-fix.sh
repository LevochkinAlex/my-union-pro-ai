#!/bin/bash
cd /opt/my-union-pro

echo "=== Step 1: Checking current status ==="
pm2 list

echo ""
echo "=== Step 2: Stopping application ==="
pm2 delete my-union-pro 2>&1

echo ""
echo "=== Step 3: Pulling latest code ==="
git pull

echo ""
echo "=== Step 4: Installing dependencies ==="
pnpm install --frozen-lockfile 2>&1 | tail -5

echo ""
echo "=== Step 5: Building application ==="
pnpm build 2>&1 | tail -30

echo ""
echo "=== Step 6: Starting application ==="
pm2 start npm --name my-union-pro -- start
sleep 10

echo ""
echo "=== Step 7: Final status ==="
pm2 list

echo ""
echo "=== Step 8: Recent logs ==="
pm2 logs my-union-pro --lines 20 --nostream 2>&1 | tail -20

echo ""
echo "=== Step 9: Testing API ==="
sleep 2
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://localhost:3004/api/profile 2>&1
