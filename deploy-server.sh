#!/bin/bash
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "=== Starting deploy ==="
echo "=== Git pull ==="
git pull
echo "=== Installing dependencies ==="
pnpm install
echo "=== Building Next.js ==="
pnpm build
echo "=== Building socket-server ==="
mkdir -p dist/server
pnpm socket:build || echo "Socket-server build failed, will use tsx fallback"
echo "=== Restarting PM2 apps ==="
pm2 restart my-union-pro
# Перезапускаем socket-server если он существует
if pm2 describe socket-server > /dev/null 2>&1; then
  echo "=== Restarting socket-server ==="
  pm2 restart socket-server
else
  echo "=== Starting socket-server for the first time ==="
  # Используем tsx для запуска если нет скомпилированного файла
  if [ -f dist/server/socket-server.js ]; then
    pm2 start dist/server/socket-server.js --name socket-server
  else
    pm2 start "pnpm socket" --name socket-server
  fi
fi
sleep 3
echo "=== PM2 Status ==="
pm2 status
echo "=== Checking API ==="
curl -s -I https://myunion.pro/api/profile | head -1
echo "=== Deploy completed ==="
EOF
