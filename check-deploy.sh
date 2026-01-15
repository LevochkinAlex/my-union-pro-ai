#!/bin/bash

SERVER="root@194.87.49.210"
PASSWORD="wu,iMrZj6goZh?"
PROJECT_DIR="/opt/my-union-pro"

echo "🔍 Checking deployment status..."
echo ""

# Function to run command on server
run_remote() {
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "$1"
}

echo "📊 PM2 Status:"
run_remote "cd $PROJECT_DIR && pm2 status"
echo ""

echo "📝 Recent PM2 Logs (last 10 lines):"
run_remote "cd $PROJECT_DIR && pm2 logs my-union-pro --lines 10 --nostream"
echo ""

echo "📦 Git Status:"
run_remote "cd $PROJECT_DIR && git log --oneline -3"
echo ""

echo "🔨 Build Check:"
run_remote "cd $PROJECT_DIR && if [ -d '.next' ]; then echo '✅ Build directory exists'; ls -lh .next | head -3; else echo '❌ Build directory not found'; fi"
echo ""

echo "🌐 Checking application availability..."
run_remote "curl -s -o /dev/null -w 'HTTP Status: %{http_code}\n' https://myunion.pro || echo 'Failed to check'"
echo ""

echo "✅ Deployment check completed"
