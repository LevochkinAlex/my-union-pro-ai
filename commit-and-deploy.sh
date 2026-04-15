#!/bin/bash
set -e

# Подхват только VDS_PASSWORD из .env, если не задан в окружении
if [ -z "$VDS_PASSWORD" ] && [ -f .env ]; then
  VDS_PASSWORD=$(grep -E '^VDS_PASSWORD=' .env 2>/dev/null | sed 's/^VDS_PASSWORD=//' | sed 's/^["'\'']//;s/["'\'']$//' | head -1)
fi

# Сервер: 194.87.49.210, путь: /opt/my-union-pro
# Пароль: в .env (VDS_PASSWORD) или export VDS_PASSWORD='...'
VDS_PASSWORD="${VDS_PASSWORD:?Set VDS_PASSWORD в .env или: export VDS_PASSWORD='your_password'}"

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

echo "📝 Step 2.6: Ensuring NEXT_PUBLIC_VK_PIXEL_ID on prod..."
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 "grep -q '^NEXT_PUBLIC_VK_PIXEL_ID=' /opt/my-union-pro/.env.local 2>/dev/null || echo 'NEXT_PUBLIC_VK_PIXEL_ID=3749973' >> /opt/my-union-pro/.env.local" && echo "✅ NEXT_PUBLIC_VK_PIXEL_ID проверен на проде"
echo ""

echo "📥 Step 3: Deploying to server..."
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 << 'EOF'
cd /opt/my-union-pro
echo "=== Git Pull ==="
git pull origin main
echo ""
echo "=== Installing dependencies ==="
pnpm install
echo ""
echo "=== Applying database migrations ==="
npx prisma migrate deploy
bash scripts/fix-chat-participant-columns-on-server.sh
echo ""
echo "=== Data migrations (AI chat merge & welcome normalize) ==="
node scripts/merge-ai-chat-branches.mjs || true
node scripts/normalize-ai-welcome-messages.mjs || true
echo ""
echo "=== Full clean build ==="
rm -rf .next node_modules/.cache
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
