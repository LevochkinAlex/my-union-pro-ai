#!/bin/bash
# Emergency fix for 503 errors

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro

echo "=== Current PM2 status ==="
pm2 list

echo ""
echo "=== Stopping application ==="
pm2 stop my-union-pro || true
pm2 delete my-union-pro || true

echo ""
echo "=== Pulling latest code ==="
git pull origin main

echo ""
echo "=== Installing dependencies ==="
pnpm install --frozen-lockfile

echo ""
echo "=== Building application ==="
pnpm build

echo ""
echo "=== Starting application ==="
pm2 start npm --name my-union-pro -- start

echo ""
echo "=== Waiting 10 seconds ==="
sleep 10

echo ""
echo "=== Final PM2 status ==="
pm2 list

echo ""
echo "=== Checking if app is responding ==="
sleep 2
curl -s -o /dev/null -w "API status: %{http_code}\n" http://localhost:3004/api/profile || echo "Local check failed"
EOF

echo ""
echo "=== Testing from outside ==="
sleep 5
curl -s -o /dev/null -w "External API: %{http_code}\n" https://myunion.pro/api/profile
