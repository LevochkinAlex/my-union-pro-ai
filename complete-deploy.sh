#!/bin/bash
set -e

# Сервер: 194.87.49.210, путь: /opt/my-union-pro
# Пароль: в vds.deploy.env (файл в .gitignore) или export VDS_PASSWORD='...'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "$SCRIPT_DIR/vds.deploy.env" ] && source "$SCRIPT_DIR/vds.deploy.env"
VDS_PASSWORD="${VDS_PASSWORD:?Set VDS_PASSWORD или создайте vds.deploy.env с export VDS_PASSWORD='...'}"

COMMIT_MSG="${1:-Fix: обновления и исправления}"

echo "=========================================="
echo "COMPLETE DEPLOY SCRIPT"
echo "=========================================="

cd "$(dirname "$0")"

echo ""
echo "Step 1: Checking git status..."
git status --short || true

echo ""
echo "Step 2: Adding all changes..."
git add -A

echo ""
echo "Step 3: Committing changes..."
git commit -m "$COMMIT_MSG" || echo "Nothing to commit or already committed"

echo ""
echo "Step 4: Pushing to remote..."
git push

echo ""
echo "Step 5: Deploying to server..."
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash << 'EOF'
cd /opt/my-union-pro
echo "--- Pulling code ---"
git pull
echo "--- Version check ---"
grep version package.json
echo "--- Building ---"
pnpm build 2>&1 | tail -25
echo "--- Restarting ---"
pm2 restart my-union-pro
sleep 10
echo "--- PM2 Status ---"
pm2 list
echo "--- Recent logs ---"
pm2 logs my-union-pro --lines 10 --nostream 2>&1 | tail -10
EOF

echo ""
echo "Step 6: Testing API..."
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile 2>&1)
echo "API Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Server is responding correctly!"
else
    echo "⚠️ Server returned: $HTTP_CODE"
fi

echo ""
echo "=========================================="
echo "DEPLOY COMPLETE"
echo "=========================================="
