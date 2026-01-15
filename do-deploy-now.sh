#!/bin/bash
set -e

cd /Users/renatusmanov/my-union-pro-ai

echo "=== Step 1: Git status ==="
git status --short

echo ""
echo "=== Step 2: Committing changes ==="
git add -A
git commit -m "Fix: версия 1.7.2, исправления создания чата и уведомлений" || echo "Nothing to commit"

echo ""
echo "=== Step 3: Pushing to remote ==="
git push

echo ""
echo "=== Step 4: Deploying to server ==="
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "Pulling latest code..."
git pull
echo "Version in package.json:"
grep version package.json
echo "Building..."
pnpm build 2>&1 | tail -20
echo "Restarting..."
pm2 restart my-union-pro
sleep 10
echo "PM2 Status:"
pm2 list
echo "Recent logs:"
pm2 logs my-union-pro --lines 10 --nostream 2>&1 | tail -10
EOF

echo ""
echo "=== Step 5: Testing API ==="
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile)
echo "API returned: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Server is working!"
else
    echo "⚠️ Server returned: $HTTP_CODE"
fi
