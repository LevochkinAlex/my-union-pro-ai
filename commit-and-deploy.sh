#!/bin/bash

set -e

echo "📦 Step 1: Committing changes..."
cd /Users/renatusmanov/my-union-pro-ai
git add -A
git commit -m "Fix: исправлено отображение кнопки закрытия обращения, обновление статуса чата после создания, исправлена статистика по обращениям" || echo "No changes to commit"
echo "✅ Changes committed"
echo ""

echo "🚀 Step 2: Pushing to repository..."
git push
echo "✅ Changes pushed"
echo ""

echo "🧪 Step 2.5: Running pre-deploy checks..."
cd /Users/renatusmanov/my-union-pro-ai
if pnpm pre-deploy; then
  echo "✅ Pre-deploy checks passed"
else
  echo "❌ Pre-deploy checks failed! Aborting deployment."
  exit 1
fi
echo ""

echo "📥 Step 3: Deploying to server..."
sshpass -p 'wu,iMrZj6goZh?' ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "=== Git Pull ==="
git pull
echo ""
echo "=== Installing dependencies ==="
pnpm install
echo ""
echo "=== Building project ==="
pnpm build
echo ""
echo "=== Restarting PM2 ==="
pm2 restart my-union-pro
pm2 restart my-union-socket
pm2 save
echo ""
echo "=== PM2 Status ==="
pm2 status
EOF

echo ""
echo "✨ Deployment completed!"
