#!/bin/bash

echo "Checking server status..."
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "=== PM2 Status ==="
pm2 status
echo ""
echo "=== Recent logs ==="
pm2 logs my-union-pro --lines 20 --nostream
echo ""
echo "=== Restarting application ==="
pm2 restart my-union-pro
sleep 3
echo ""
echo "=== PM2 Status after restart ==="
pm2 status
EOF

echo ""
echo "Checking API endpoint..."
curl -I https://myunion.pro/api/profile 2>&1 | head -3
