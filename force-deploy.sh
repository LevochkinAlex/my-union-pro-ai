#!/bin/bash
set -e
set -x

cd /Users/renatusmanov/my-union-pro-ai

echo "=== 1. Checking local changes ==="
git status --short

echo "=== 2. Adding all changes ==="
git add -A

echo "=== 3. Committing ==="
git commit -m "Fix: исправления чата, статистики, закрытия обращений" || echo "Nothing to commit"

echo "=== 4. Pushing to remote ==="
git push origin HEAD

echo "=== 5. Deploying to server ==="
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash -c '
set -e
cd /opt/my-union-pro
echo "=== Git Pull ==="
git fetch origin
git pull origin HEAD
echo "=== Current commit ==="
git log -1 --oneline
echo "=== Removing old build ==="
rm -rf .next
echo "=== Installing ==="
pnpm install
echo "=== Building ==="
pnpm build
echo "=== Restarting ==="
pm2 restart my-union-pro
sleep 3
echo "=== Status ==="
pm2 status
echo "=== Logs ==="
pm2 logs my-union-pro --lines 5 --nostream
'

echo "=== Done ==="
