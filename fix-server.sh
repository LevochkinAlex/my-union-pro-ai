#!/bin/bash

echo "=== Checking server status ==="
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
cd /opt/my-union-pro
echo "Current directory: $(pwd)"
echo ""
echo "=== PM2 Status ==="
pm2 status
echo ""
echo "=== Recent logs (last 20 lines) ==="
pm2 logs my-union-pro --lines 20 --nostream 2>&1 | tail -20
echo ""
echo "=== System resources ==="
free -h | head -2
df -h / | tail -1
echo ""
echo "=== Restarting application ==="
pm2 restart my-union-pro
sleep 5
echo ""
echo "=== PM2 Status after restart ==="
pm2 status
echo ""
echo "=== Pulling latest code ==="
git pull origin main
echo ""
echo "=== Building application ==="
pnpm build
echo ""
echo "=== Restarting after build ==="
pm2 restart my-union-pro
sleep 5
echo ""
echo "=== Final PM2 Status ==="
pm2 status
ENDSSH

echo ""
echo "=== Testing API endpoint ==="
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile)
echo "API /api/profile returned: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  echo "✅ Server is responding!"
else
  echo "⚠️ Server returned: $HTTP_CODE"
fi
