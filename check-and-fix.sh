#!/bin/bash
# Check application status and fix issues

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro

echo "=== PM2 Status ==="
pm2 list

echo ""
echo "=== Recent Errors (last 50 lines) ==="
pm2 logs my-union-pro --lines 50 --nostream 2>&1 | grep -i error | tail -20

echo ""
echo "=== Last 30 lines of logs ==="
pm2 logs my-union-pro --lines 30 --nostream 2>&1 | tail -30

echo ""
echo "=== Checking if app is listening on port 3004 ==="
netstat -tlnp | grep 3004 || ss -tlnp | grep 3004 || echo "Port 3004 not found"

echo ""
echo "=== Checking nginx status ==="
systemctl status nginx --no-pager | head -10

echo ""
echo "=== Testing local API ==="
curl -s -o /dev/null -w "Local API: %{http_code}\n" http://localhost:3004/api/profile || echo "Local API failed"

echo ""
echo "=== Restarting with fresh start ==="
pm2 delete my-union-pro
sleep 2
pm2 start npm --name my-union-pro -- start
sleep 5

echo ""
echo "=== Final status ==="
pm2 list
pm2 logs my-union-pro --lines 10 --nostream 2>&1 | tail -10
EOF

echo ""
echo "=== Testing external API ==="
sleep 5
curl -s -o /dev/null -w "External API: %{http_code}\n" https://myunion.pro/api/profile
