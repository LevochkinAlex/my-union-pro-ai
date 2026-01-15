#!/bin/bash
# Complete server diagnosis and fix

echo "=== Server Diagnosis Script ==="
echo ""

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH'
cd /opt/my-union-pro

echo "1. PM2 Status:"
pm2 list
echo ""

echo "2. Recent errors from logs:"
pm2 logs my-union-pro --err --lines 20 --nostream 2>&1 | tail -20
echo ""

echo "3. Last 20 lines of all logs:"
pm2 logs my-union-pro --lines 20 --nostream 2>&1 | tail -20
echo ""

echo "4. Checking port 3004:"
lsof -i :3004 || netstat -tlnp | grep 3004 || ss -tlnp | grep 3004 || echo "Port not in use"
echo ""

echo "5. Checking if .env.local exists:"
ls -la .env.local 2>&1
echo ""

echo "6. Checking Node version:"
node --version
echo ""

echo "7. Stopping and cleaning PM2:"
pm2 stop my-union-pro 2>&1
pm2 delete my-union-pro 2>&1
sleep 2
echo ""

echo "8. Pulling latest code:"
git pull
echo ""

echo "9. Installing dependencies:"
pnpm install --frozen-lockfile 2>&1 | tail -10
echo ""

echo "10. Building application:"
pnpm build 2>&1 | tail -20
echo ""

echo "11. Starting application:"
NODE_ENV=production pm2 start npm --name my-union-pro -- start
sleep 8
echo ""

echo "12. Final PM2 status:"
pm2 list
echo ""

echo "13. Recent logs after restart:"
pm2 logs my-union-pro --lines 15 --nostream 2>&1 | tail -15
echo ""

echo "14. Testing local API:"
sleep 2
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://localhost:3004/api/profile 2>&1 || echo "Failed"
ENDSSH

echo ""
echo "=== Testing external API ==="
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile 2>&1)
echo "External API returned: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Server is working!"
else
    echo "⚠️ Server still has issues (HTTP $HTTP_CODE)"
fi
