#!/bin/bash
set -e

# Сервер: 194.87.49.210, путь: /opt/my-union-pro
# Пароль: в vds.deploy.env (файл в .gitignore) или export VDS_PASSWORD='...'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "$SCRIPT_DIR/vds.deploy.env" ] && source "$SCRIPT_DIR/vds.deploy.env"
VDS_PASSWORD="${VDS_PASSWORD:?Set VDS_PASSWORD или создайте vds.deploy.env с export VDS_PASSWORD='...'}"

read_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi

  local line
  line=$(grep -E "^${key}=" "$file" | tail -n 1 || true)
  if [ -z "$line" ]; then
    return 0
  fi

  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf "%s" "$value"
}

COMMIT_MSG="${1:-Fix: обновления и исправления}"

echo "=========================================="
echo "COMPLETE DEPLOY SCRIPT"
echo "=========================================="

cd "$(dirname "$0")"

echo ""
echo "Step 1: Checking git status..."
git status --short || true

echo ""
echo "Step 2: Adding all changes..."
git add -A

echo ""
echo "Step 3: Committing changes..."
git commit -m "$COMMIT_MSG" || echo "Nothing to commit or already committed"

echo ""
echo "Step 4: Pushing to remote..."
git push

echo ""
echo "Step 5: Deploying to server..."
# Подтягиваем VK_ID_CLIENT_ID из vds.deploy.env или .env.local/.env без source (чтобы не падать на спецсимволах)
[ -f "$SCRIPT_DIR/vds.deploy.env" ] && source "$SCRIPT_DIR/vds.deploy.env"

if [ -z "$VK_ID_CLIENT_ID" ]; then
  VK_ID_CLIENT_ID="$(read_env_value "$SCRIPT_DIR/.env.local" "VK_ID_CLIENT_ID")"
fi
if [ -z "$VK_ID_CLIENT_ID" ]; then
  VK_ID_CLIENT_ID="$(read_env_value "$SCRIPT_DIR/.env" "VK_ID_CLIENT_ID")"
fi

if [ -n "$VK_ID_CLIENT_ID" ]; then
  sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 "grep -q '^VK_ID_CLIENT_ID=' /opt/my-union-pro/.env.local 2>/dev/null || echo 'VK_ID_CLIENT_ID=$VK_ID_CLIENT_ID' >> /opt/my-union-pro/.env.local" && echo "✅ VK_ID_CLIENT_ID прописан на проде"
fi

# T-Bank эквайринг: подтягиваем из vds.deploy.env или .env.local/.env и дописываем на прод при отсутствии
if [ -z "$TBANK_TERMINAL_KEY" ]; then
  TBANK_TERMINAL_KEY="$(read_env_value "$SCRIPT_DIR/.env.local" "TBANK_TERMINAL_KEY")"
fi
if [ -z "$TBANK_TERMINAL_KEY" ]; then
  TBANK_TERMINAL_KEY="$(read_env_value "$SCRIPT_DIR/.env" "TBANK_TERMINAL_KEY")"
fi
if [ -z "$TBANK_TERMINAL_PASSWORD" ]; then
  TBANK_TERMINAL_PASSWORD="$(read_env_value "$SCRIPT_DIR/.env.local" "TBANK_TERMINAL_PASSWORD")"
fi
if [ -z "$TBANK_TERMINAL_PASSWORD" ]; then
  TBANK_TERMINAL_PASSWORD="$(read_env_value "$SCRIPT_DIR/.env" "TBANK_TERMINAL_PASSWORD")"
fi
if [ -z "$TBANK_API_BASE_URL" ]; then
  TBANK_API_BASE_URL="$(read_env_value "$SCRIPT_DIR/.env.local" "TBANK_API_BASE_URL")"
fi
if [ -z "$TBANK_API_BASE_URL" ]; then
  TBANK_API_BASE_URL="$(read_env_value "$SCRIPT_DIR/.env" "TBANK_API_BASE_URL")"
fi
if [ -z "$TBANK_API_BASE_URL" ]; then
  TBANK_API_BASE_URL="https://securepay.tinkoff.ru/v2"
fi

if [ -n "$TBANK_TERMINAL_KEY" ] || [ -n "$TBANK_TERMINAL_PASSWORD" ]; then
  sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 "cd /opt/my-union-pro && \
    (grep -q '^TBANK_TERMINAL_KEY=' .env.local 2>/dev/null || echo \"TBANK_TERMINAL_KEY=$TBANK_TERMINAL_KEY\" >> .env.local); \
    (grep -q '^TBANK_TERMINAL_PASSWORD=' .env.local 2>/dev/null || echo \"TBANK_TERMINAL_PASSWORD=$TBANK_TERMINAL_PASSWORD\" >> .env.local); \
    (grep -q '^TBANK_API_BASE_URL=' .env.local 2>/dev/null || echo \"TBANK_API_BASE_URL=$TBANK_API_BASE_URL\" >> .env.local)"
  echo "✅ T-Bank env проверен/прописан на проде"
fi

# VK Pixel (аналитика) — на проде должен быть NEXT_PUBLIC_VK_PIXEL_ID
NEXT_PUBLIC_VK_PIXEL_ID="${NEXT_PUBLIC_VK_PIXEL_ID:-$(read_env_value "$SCRIPT_DIR/.env.local" "NEXT_PUBLIC_VK_PIXEL_ID")}"
NEXT_PUBLIC_VK_PIXEL_ID="${NEXT_PUBLIC_VK_PIXEL_ID:-$(read_env_value "$SCRIPT_DIR/.env" "NEXT_PUBLIC_VK_PIXEL_ID")}"
NEXT_PUBLIC_VK_PIXEL_ID="${NEXT_PUBLIC_VK_PIXEL_ID:-3749973}"
sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 "grep -q '^NEXT_PUBLIC_VK_PIXEL_ID=' /opt/my-union-pro/.env.local 2>/dev/null || echo 'NEXT_PUBLIC_VK_PIXEL_ID=$NEXT_PUBLIC_VK_PIXEL_ID' >> /opt/my-union-pro/.env.local" && echo "✅ NEXT_PUBLIC_VK_PIXEL_ID проверен на проде"

sshpass -p "$VDS_PASSWORD" ssh -o StrictHostKeyChecking=no root@194.87.49.210 bash << 'EOF'
cd /opt/my-union-pro
echo "--- Pulling code ---"
git pull origin main
echo "--- Version check ---"
grep version package.json
echo "--- Building ---"
pnpm build 2>&1 | tail -25
echo "--- Restarting ---"
pm2 restart my-union-pro
sleep 10
echo "--- PM2 Status ---"
pm2 list
echo "--- Recent logs ---"
pm2 logs my-union-pro --lines 10 --nostream 2>&1 | tail -10
EOF

echo ""
echo "Step 6: Testing API..."
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile 2>&1)
echo "API Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    echo "✅ Server is responding correctly!"
else
    echo "⚠️ Server returned: $HTTP_CODE"
fi

echo ""
echo "Step 7: MAX webhook (прод)..."
if WEBHOOK_URL="https://myunion.pro/api/max/webhook" node scripts/register-max-webhook.mjs 2>&1; then
  echo "✅ MAX webhook зарегистрирован"
else
  echo "⏭ MAX webhook: пропущено или ошибка (добавьте MAX_BOT_TOKEN в .env для авторегистрации)"
fi

echo ""
echo "=========================================="
echo "DEPLOY COMPLETE"
echo "=========================================="
