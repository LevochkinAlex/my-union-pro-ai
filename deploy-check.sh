#!/bin/bash

echo "=== 1. Local Git Status ==="
cd /Users/renatusmanov/my-union-pro-ai
git status --short
echo ""

echo "=== 2. Last 3 commits ==="
git log --oneline -3
echo ""

echo "=== 3. Committing changes ==="
git add -A
git commit -m "Fix: исправления чата и статистики" || echo "Nothing to commit"
echo ""

echo "=== 4. Pushing ==="
git push
echo ""

echo "=== 5. Server Status ==="
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 'cd /opt/my-union-pro && echo "Current commit:" && git log -1 --oneline && echo "Status:" && git status --short'
echo ""

echo "=== 6. Deploying ==="
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 'cd /opt/my-union-pro && git pull && echo "---" && pnpm build && echo "---" && pm2 restart my-union-pro && sleep 2 && pm2 status'
echo ""

echo "=== Done ==="
