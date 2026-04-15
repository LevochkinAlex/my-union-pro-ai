#!/bin/bash
# Full server fix and deploy script

set -e

SERVER="root@194.87.49.210"
PASS="wu,iMrZj6goZh?"
PROJECT_DIR="/opt/my-union-pro"

echo "🔧 Starting full server fix and deploy..."
echo ""

# Function to run SSH command
ssh_cmd() {
    sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$SERVER" "$1"
}

# Step 1: Check current status
echo "📊 Step 1: Checking current PM2 status..."
ssh_cmd "cd $PROJECT_DIR && pm2 status" || echo "⚠️ Could not check PM2 status"
echo ""

# Step 2: Check recent errors
echo "📋 Step 2: Checking recent logs for errors..."
ssh_cmd "cd $PROJECT_DIR && pm2 logs my-union-pro --lines 20 --nostream 2>&1 | grep -i error | tail -10" || echo "No recent errors found"
echo ""

# Step 3: Restart PM2
echo "🔄 Step 3: Restarting PM2 application..."
ssh_cmd "cd $PROJECT_DIR && pm2 restart my-union-pro"
sleep 3
echo ""

# Step 4: Pull latest code
echo "📥 Step 4: Pulling latest code from git..."
ssh_cmd "cd $PROJECT_DIR && git pull origin main"
echo ""

# Step 5: Install dependencies if needed
echo "📦 Step 5: Checking dependencies..."
ssh_cmd "cd $PROJECT_DIR && pnpm install --frozen-lockfile"
echo ""

# Step 6: Build application
echo "🏗️  Step 6: Building application..."
ssh_cmd "cd $PROJECT_DIR && pnpm build"
echo ""

# Step 7: Final restart
echo "🚀 Step 7: Final restart..."
ssh_cmd "cd $PROJECT_DIR && pm2 restart my-union-pro"
sleep 5
echo ""

# Step 8: Final status check
echo "✅ Step 8: Final status check..."
ssh_cmd "cd $PROJECT_DIR && pm2 status"
echo ""

# Step 9: Test API
echo "🧪 Step 9: Testing API endpoint..."
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile || echo "000")
echo "API returned HTTP code: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Server is responding correctly!"
elif [ "$HTTP_CODE" = "503" ]; then
    echo "⚠️ Server still returning 503, may need more time to start"
    echo "Waiting 10 more seconds..."
    sleep 10
    HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile || echo "000")
    echo "Second check returned: $HTTP_CODE2"
else
    echo "⚠️ Unexpected response: $HTTP_CODE"
fi

echo ""
echo "🎉 Fix and deploy complete!"
