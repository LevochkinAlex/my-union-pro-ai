#!/bin/bash

# Deploy to VDS server
# Usage: ./scripts/deploy-to-vds.sh

set -e

echo "🚀 Deploying MyUnion Pro to VDS..."

# VDS server details (from .env or hardcoded)
VDS_HOST="${VDS_HOST:-80.87.106.112}"
VDS_USER="${VDS_USER:-root}"
VDS_PATH="${VDS_PATH:-/root/my-union-pro-ai}"

echo "📡 Connecting to ${VDS_USER}@${VDS_HOST}..."

# SSH and deploy
ssh ${VDS_USER}@${VDS_HOST} << 'ENDSSH'
cd /root/my-union-pro-ai || exit 1

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🏗️  Building application..."
pnpm build

echo "🔄 Restarting PM2 process..."
pm2 restart myunion-pro || pm2 start pnpm --name myunion-pro -- start

echo "✅ Deployment complete!"
pm2 status
ENDSSH

echo ""
echo "✅ Deployment finished!"
echo "🌐 Application should be running at: http://${VDS_HOST}:3004"
echo ""
echo "📊 Check status: ssh ${VDS_USER}@${VDS_HOST} 'pm2 status'"
echo "📋 Check logs: ssh ${VDS_USER}@${VDS_HOST} 'pm2 logs myunion-pro'"
