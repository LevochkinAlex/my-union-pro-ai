#!/bin/bash

# Deploy to VDS server
# Usage: ./scripts/deploy-to-vds.sh

set -e

echo "🚀 Deploying MyUnion Pro to VDS..."

# VDS server details (from .env or environment variables)
# ⚠️ ВАЖНО: Не храните пароли в коде! Используйте переменные окружения!
VDS_HOST="${VDS_HOST:-194.87.49.210}"
VDS_USER="${VDS_USER:-root}"
VDS_PATH="${VDS_PATH:-/opt/my-union-pro}"
VDS_PASSWORD="${VDS_PASSWORD:-YOUR_SSH_PASSWORD}"

if [ "$VDS_PASSWORD" = "YOUR_SSH_PASSWORD" ]; then
  echo "❌ Ошибка: Необходимо установить переменную окружения VDS_PASSWORD"
  echo "Пример: export VDS_PASSWORD='your_password'"
  exit 1
fi

echo "📡 Connecting to ${VDS_USER}@${VDS_HOST}..."

# SSH and deploy using sshpass
sshpass -p "${VDS_PASSWORD}" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${VDS_USER}@${VDS_HOST} << 'ENDSSH'
cd /opt/my-union-pro || exit 1

echo "🛑 Останавливаем приложение..."
pm2 stop my-union-pro || true

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔄 Generating Prisma client..."
npx prisma generate

echo "🗄️  Pushing database schema..."
npx prisma db push --accept-data-loss

echo "📚 Добавляем справочники должностей и профессий..."
npx tsx prisma/seed-dictionaries.ts || echo "⚠️  Seed dictionaries skipped (file may not exist)"

echo "🏗️  Building application..."
pnpm build

echo "🔄 Перезапускаем PM2..."
pm2 restart my-union-pro
pm2 save

echo "✅ Деплой завершен!"
echo ""
echo "📊 Статус приложения:"
pm2 list

echo ""
echo "📋 Последние логи:"
pm2 logs my-union-pro --lines 20 --nostream

echo "✅ Adding WhatsApp environment variables to .env.local..."
# Backup existing .env.local
cp .env.local .env.local.backup 2>/dev/null || true

# Add WhatsApp variables if not present (using environment variables)
# ⚠️ ВАЖНО: Не храните токены в коде! Используйте переменные окружения!
if [ -n "$WHATSAPP_ACCESS_TOKEN" ]; then
  grep -q "WHATSAPP_ACCESS_TOKEN" .env.local 2>/dev/null || echo "WHATSAPP_ACCESS_TOKEN=${WHATSAPP_ACCESS_TOKEN}" >> .env.local
fi
if [ -n "$WHATSAPP_PHONE_NUMBER_ID" ]; then
  grep -q "WHATSAPP_PHONE_NUMBER_ID" .env.local 2>/dev/null || echo "WHATSAPP_PHONE_NUMBER_ID=${WHATSAPP_PHONE_NUMBER_ID}" >> .env.local
fi
if [ -n "$WHATSAPP_BUSINESS_ACCOUNT_ID" ]; then
  grep -q "WHATSAPP_BUSINESS_ACCOUNT_ID" .env.local 2>/dev/null || echo "WHATSAPP_BUSINESS_ACCOUNT_ID=${WHATSAPP_BUSINESS_ACCOUNT_ID}" >> .env.local
fi

# Add MAX Bot Token if not present (optional - user needs to add it manually)
# grep -q "MAX_BOT_TOKEN" .env.local 2>/dev/null || echo "# MAX_BOT_TOKEN=your_token_here" >> .env.local

echo "🔄 Restarting PM2 process..."
pm2 restart my-union-pro || pm2 start npm --name my-union-pro -- start

echo "✅ Deployment complete!"
pm2 status
pm2 logs my-union-pro --lines 50
ENDSSH

echo ""
echo "✅ Deployment finished!"
echo "🌐 Application running at: https://myunion.pro"
echo ""
echo "📊 Check status: ssh ${VDS_USER}@${VDS_HOST} 'pm2 status'"
echo "📋 Check logs: ssh ${VDS_USER}@${VDS_HOST} 'pm2 logs my-union-pro'"
