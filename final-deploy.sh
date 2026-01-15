#!/bin/bash
set -x
set -e

cd /Users/renatusmanov/my-union-pro-ai

echo "=== Committing ==="
git add -A
git commit -m "Fix: исправления чата и статистики" || echo "Nothing to commit"
git push || echo "Push failed or nothing to push"

echo "=== Deploying ==="
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash << 'REMOTE'
set -e
cd /opt/my-union-pro
echo "=== Git Pull ==="
git pull
echo "=== Install ==="
pnpm install
echo "=== Build ==="
pnpm build
echo "=== Restart ==="
pm2 restart my-union-pro
sleep 2
echo "=== Status ==="
pm2 status
REMOTE

echo "=== Done ==="
