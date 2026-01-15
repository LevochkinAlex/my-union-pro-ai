#!/bin/bash
# Script to update version on server

set -e

SERVER="root@194.87.49.210"
PASS="wu,iMrZj6goZh?"
PROJECT_DIR="/opt/my-union-pro"

echo "🔄 Updating version on server..."
echo ""

# Function to run SSH command
ssh_cmd() {
    sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$SERVER" "$1"
}

# Step 1: Pull latest code
echo "📥 Step 1: Pulling latest code..."
ssh_cmd "cd $PROJECT_DIR && git pull"
echo ""

# Step 2: Check current version in package.json
echo "📋 Step 2: Checking version in package.json..."
ssh_cmd "cd $PROJECT_DIR && grep '\"version\"' package.json"
echo ""

# Step 3: Rebuild application (this will pick up new version from package.json)
echo "🏗️  Step 3: Rebuilding application..."
ssh_cmd "cd $PROJECT_DIR && pnpm build"
echo ""

# Step 4: Restart application
echo "🚀 Step 4: Restarting application..."
ssh_cmd "cd $PROJECT_DIR && pm2 restart my-union-pro"
sleep 3
echo ""

# Step 5: Check status
echo "✅ Step 5: Checking PM2 status..."
ssh_cmd "cd $PROJECT_DIR && pm2 status"
echo ""

echo "🎉 Version update complete!"
echo "Note: Version is embedded during build, so rebuild was necessary."
