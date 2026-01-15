#!/bin/bash
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "=== Starting deploy ==="
echo "=== Git pull ==="
git pull
echo "=== Building ==="
pnpm build
echo "=== Restarting PM2 ==="
pm2 restart my-union-pro
sleep 3
echo "=== PM2 Status ==="
pm2 status
echo "=== Checking API ==="
curl -s -I https://myunion.pro/api/profile | head -1
echo "=== Deploy completed ==="
EOF
