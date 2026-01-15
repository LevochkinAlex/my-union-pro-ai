#!/bin/bash

sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'ENDSSH' 2>&1 | tee /tmp/deploy.log
cd /opt/my-union-pro
echo "=== Git Pull ==="
git pull
echo ""
echo "=== Installing dependencies ==="
pnpm install
echo ""
echo "=== Building ==="
pnpm build
echo ""
echo "=== Restarting PM2 ==="
pm2 restart my-union-pro
echo ""
echo "=== PM2 Status ==="
pm2 status
echo ""
echo "=== Recent Logs ==="
pm2 logs my-union-pro --lines 5 --nostream
ENDSSH

echo ""
echo "=== Deployment output saved to /tmp/deploy.log ==="
cat /tmp/deploy.log
