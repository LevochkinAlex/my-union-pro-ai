#!/bin/bash
# Проверка статуса деплоя на сервере. Пароль: vds.deploy.env или export VDS_PASSWORD='...'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "$SCRIPT_DIR/vds.deploy.env" ] && source "$SCRIPT_DIR/vds.deploy.env"

SERVER="root@194.87.49.210"
PROJECT_DIR="/opt/my-union-pro"
VDS_PASSWORD="${VDS_PASSWORD:?Set VDS_PASSWORD или создайте vds.deploy.env}"

echo "🔍 Checking deployment status..."
echo ""

run_remote() {
    sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" "$1" 2>&1
}

echo "📊 PM2 Status:"
run_remote "cd $PROJECT_DIR && pm2 status"
echo ""

echo "📝 Last Git Commit:"
run_remote "cd $PROJECT_DIR && git log -1 --pretty=format:'%h - %an, %ar : %s'"
echo ""

echo "📦 Git Status:"
run_remote "cd $PROJECT_DIR && git status --short"
echo ""

echo "🔨 Build Check:"
run_remote "cd $PROJECT_DIR && if [ -d '.next' ]; then echo '✅ Build directory exists'; ls -lh .next | head -3; else echo '❌ Build directory not found'; fi"
echo ""

echo "🌐 Site Status:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nResponse Time: %{time_total}s\n" https://myunion.pro --max-time 5
echo ""

echo "✅ Status check completed"
