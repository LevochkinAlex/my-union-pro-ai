#!/bin/bash

# Deploy to VDS server
# Usage: ./scripts/deploy-to-vds.sh

set -e

echo "🚀 Deploying MyUnion Pro to VDS..."

# VDS server details (from .env or hardcoded)
VDS_HOST="${VDS_HOST:-194.87.49.210}"
VDS_USER="${VDS_USER:-root}"
VDS_PATH="${VDS_PATH:-/opt/my-union-pro}"
VDS_PASSWORD="${VDS_PASSWORD:-sAt,8?Bh+Ny_BW}"

echo "📡 Connecting to ${VDS_USER}@${VDS_HOST}..."

# SSH and deploy using sshpass
sshpass -p "${VDS_PASSWORD}" ssh -o StrictHostKeyChecking=no ${VDS_USER}@${VDS_HOST} << 'ENDSSH'
cd /opt/my-union-pro || exit 1

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔄 Generating Prisma client..."
npx prisma generate

echo "🗄️  Pushing database schema..."
npx prisma db push --accept-data-loss

echo "🏗️  Building application..."
pnpm build

echo "✅ Adding WhatsApp environment variables to .env.local..."
# Backup existing .env.local
cp .env.local .env.local.backup 2>/dev/null || true

# Add WhatsApp variables if not present
grep -q "WHATSAPP_ACCESS_TOKEN" .env.local 2>/dev/null || echo "WHATSAPP_ACCESS_TOKEN=EAAd6IqvMNZBMBQHNJHWH3sMvZAYBR8ZCvnw8FoU0pnEM5TyCe9Fj0c82wp5t6jBEsAbocdhI0Y5dtzieKV2dZAPKkULpYabxbYh5hVLulP8OIfsLNs1iTDK0wFCICrr6QZAhTZCeUMZA5ZCQZAMkrJCHDfOTab2HNxKDODLVw4qZBqZCas94ZAWipwbZCsRH8jHqtvBWv1AZDZD" >> .env.local
grep -q "WHATSAPP_PHONE_NUMBER_ID" .env.local 2>/dev/null || echo "WHATSAPP_PHONE_NUMBER_ID=867058486493985" >> .env.local
grep -q "WHATSAPP_BUSINESS_ACCOUNT_ID" .env.local 2>/dev/null || echo "WHATSAPP_BUSINESS_ACCOUNT_ID=138596839968735" >> .env.local

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
