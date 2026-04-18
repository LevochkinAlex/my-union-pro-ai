#!/bin/bash
# Скрипт для добавления BB_PASSWORD_ENCRYPTION_KEY на сервер
# Использование: ./scripts/add-encryption-key-to-server.sh "значение_ключа"

set -e

# Загружаем конфигурацию
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/.deploy/vds-config.sh"

if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE"
fi

SSH_HOST="${VDS_HOST:-root@79.143.29.66}"
SSH_PASSWORD="${VDS_PASSWORD:-}"
DEPLOY_PATH="${VDS_DEPLOY_PATH:-/opt/my-union-pro}"
ENCRYPTION_KEY="$1"

if [ -z "$ENCRYPTION_KEY" ]; then
  echo "❌ Ошибка: Не указан ключ шифрования"
  echo ""
  echo "Использование:"
  echo "  ./scripts/add-encryption-key-to-server.sh \"ваш_ключ_шифрования\""
  echo ""
  echo "Или через переменную окружения:"
  echo "  ENCRYPTION_KEY=\"ваш_ключ\" ./scripts/add-encryption-key-to-server.sh"
  exit 1
fi

if [ -z "$SSH_PASSWORD" ]; then
  echo "❌ Ошибка: Пароль SSH не найден в конфигурации"
  exit 1
fi

echo "🔐 Добавляю BB_PASSWORD_ENCRYPTION_KEY на сервер..."
echo "   Host: $SSH_HOST"
echo "   Path: $DEPLOY_PATH"
echo ""

# Проверяем, есть ли уже эта переменная
if sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "grep -q 'BB_PASSWORD_ENCRYPTION_KEY' $DEPLOY_PATH/.env.local 2>/dev/null"; then
  echo "⚠️  BB_PASSWORD_ENCRYPTION_KEY уже существует в .env.local"
  echo "   Обновляю значение..."
  sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_HOST" << EOF
cd $DEPLOY_PATH
sed -i 's|^BB_PASSWORD_ENCRYPTION_KEY=.*|BB_PASSWORD_ENCRYPTION_KEY="$ENCRYPTION_KEY"|' .env.local
EOF
else
  echo "➕ Добавляю BB_PASSWORD_ENCRYPTION_KEY в .env.local..."
  sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_HOST" << EOF
cd $DEPLOY_PATH
echo "" >> .env.local
echo "# BestBenefits Password Encryption Key" >> .env.local
echo "BB_PASSWORD_ENCRYPTION_KEY=\"$ENCRYPTION_KEY\"" >> .env.local
EOF
fi

echo "✅ BB_PASSWORD_ENCRYPTION_KEY успешно добавлен в .env.local"
echo ""
echo "⚠️  ВАЖНО: Перезапустите приложение для применения изменений:"
echo "   ssh $SSH_HOST 'pm2 restart my-union-pro'"

