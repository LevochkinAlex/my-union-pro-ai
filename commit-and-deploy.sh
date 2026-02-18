#!/bin/bash
set -e

# Сервер: 194.87.49.210, путь: /opt/my-union-pro
# Пароль: export VDS_PASSWORD='...' (не хранить в репо!)
VDS_PASSWORD="${VDS_PASSWORD:?Set VDS_PASSWORD: export VDS_PASSWORD='your_password'}"

COMMIT_MSG="${1:-Fix: обновления и исправления}"

echo "📦 Step 1: Committing changes..."
cd "$(dirname "$0")"
git add -A
git commit -m "$COMMIT_MSG" || echo "No changes to commit"
echo "✅ Changes committed"
echo ""

echo "🚀 Step 2: Pushing to repository..."
git push
echo "✅ Changes pushed"
echo ""

echo "🧪 Step 2.5: Running pre-deploy checks..."
if pnpm pre-deploy; then
  echo "✅ Pre-deploy checks passed"
else
  echo "❌ Pre-deploy checks failed! Aborting deployment."
  exit 1
fi
echo ""

echo "📥 Step 3: Deploying to server..."
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "=== Git Pull ==="
git pull
echo ""
echo "=== Installing dependencies ==="
pnpm install
echo ""
echo "=== Applying database migrations ==="
npx prisma migrate deploy
bash scripts/fix-chat-participant-columns-on-server.sh
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
