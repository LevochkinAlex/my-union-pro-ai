#!/bin/bash

# Скрипт деплоя на VDS
# Использование: ./scripts/deploy-to-vds.sh

set -e

# Загружаем конфигурацию из .deploy/vds-config.sh если существует
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/.deploy/vds-config.sh"

if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE"
  echo "✅ Загружена конфигурация из .deploy/vds-config.sh"
fi

# Параметры (можно передать как аргументы или использовать переменные окружения)
SSH_HOST="${1:-${VDS_HOST:-$DEPLOY_SSH_HOST}}"
DEPLOY_PATH="${2:-${VDS_DEPLOY_PATH:-$DEPLOY_PATH}}"
BRANCH="${3:-${VDS_BRANCH:-main}}"
SSH_PASSWORD="${VDS_PASSWORD:-}"
PM2_NAME="${VDS_PM2_NAME:-my-union-pro}"

# Проверка параметров
if [ -z "$SSH_HOST" ] || [ -z "$DEPLOY_PATH" ]; then
  echo "❌ Ошибка: Не указаны SSH хост и путь деплоя"
  echo ""
  echo "Использование:"
  echo "  ./scripts/deploy-to-vds.sh [user@host] [путь_на_сервере] [ветка]"
  echo ""
  echo "Или через конфигурационный файл:"
  echo "  Создайте .deploy/vds-config.sh с переменными:"
  echo "    VDS_HOST='user@host'"
  echo "    VDS_DEPLOY_PATH='/path/to/project'"
  echo "    VDS_BRANCH='main'"
  echo "    VDS_PASSWORD='password' (опционально)"
  echo ""
  exit 1
fi

echo "🚀 Начинаю деплой на VDS..."
echo "   Host: $SSH_HOST"
echo "   Path: $DEPLOY_PATH"
echo "   Branch: $BRANCH"
echo ""

# Определяем SSH команду (с паролем через sshpass или без)
USE_SSHPASS=false
if [ -n "$SSH_PASSWORD" ] && command -v sshpass >/dev/null 2>&1; then
  USE_SSHPASS=true
  SSH_CMD="sshpass -p '$SSH_PASSWORD' ssh -o StrictHostKeyChecking=no"
  echo "✅ Использую sshpass для автоматической аутентификации"
elif [ -n "$SSH_PASSWORD" ]; then
  echo "⚠️  sshpass не установлен. Пытаюсь подключиться без пароля..."
  echo "   Установите: brew install hudochenkov/sshpass/sshpass (macOS)"
  SSH_CMD="ssh -o StrictHostKeyChecking=no"
else
  SSH_CMD="ssh -o StrictHostKeyChecking=no"
fi

# Проверка SSH подключения
echo "📡 Проверяю SSH подключение..."
if [ "$USE_SSHPASS" = true ]; then
  if ! sshpass -p "$SSH_PASSWORD" ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SSH_HOST" exit 2>/dev/null; then
    echo "❌ Ошибка: Не удалось подключиться к $SSH_HOST"
    echo "   Проверьте правильность данных подключения"
    exit 1
  fi
else
  if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SSH_HOST" exit 2>/dev/null; then
    echo "❌ Ошибка: Не удалось подключиться к $SSH_HOST"
    echo "   Убедитесь, что:"
    echo "   - SSH ключ настроен или пароль указан"
    echo "   - Хост доступен"
    exit 1
  fi
fi
echo "✅ SSH подключение работает"
echo ""

# Функция для выполнения SSH команд
run_ssh() {
  local cmd="$1"
  if [ "$USE_SSHPASS" = true ]; then
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "$cmd"
  else
    ssh -o StrictHostKeyChecking=no "$SSH_HOST" "$cmd"
  fi
}

# Выполняем деплой
echo "📦 Подключаюсь к серверу и обновляю код..."

run_ssh "cd $DEPLOY_PATH || { echo '❌ Путь $DEPLOY_PATH не найден!'; exit 1; }"

echo "📥 Получаю последние изменения из репозитория..."
run_ssh "cd $DEPLOY_PATH && git fetch origin && git checkout $BRANCH && git pull origin $BRANCH"

echo "📦 Устанавливаю зависимости..."
run_ssh "cd $DEPLOY_PATH && if [ -f 'pnpm-lock.yaml' ]; then pnpm install --frozen-lockfile; elif [ -f 'package-lock.json' ]; then npm ci; else npm install; fi"

echo "🗄️  Обновляю Prisma схему..."
run_ssh "cd $DEPLOY_PATH && npx prisma generate || echo '⚠️  Prisma generate пропущен'"

echo "🏗️  Собираю приложение..."
run_ssh "cd $DEPLOY_PATH && (pnpm run build || npm run build)"

echo "🔄 Перезапускаю приложение..."
# Проверяем способ запуска приложения
if run_ssh "command -v pm2 >/dev/null 2>&1" 2>/dev/null; then
  echo "   Используется PM2 (процесс: $PM2_NAME)..."
  run_ssh "pm2 restart $PM2_NAME || pm2 start npm --name '$PM2_NAME' -- start"
  run_ssh "pm2 save"
elif run_ssh "systemctl is-active --quiet $PM2_NAME 2>/dev/null" 2>/dev/null; then
  echo "   Используется systemd..."
  run_ssh "sudo systemctl restart $PM2_NAME"
elif run_ssh "[ -f '$DEPLOY_PATH/docker-compose.yml' ]" 2>/dev/null; then
  echo "   Используется Docker..."
  run_ssh "cd $DEPLOY_PATH && docker-compose up -d --build"
else
  echo "⚠️  Автоматический перезапуск не найден. Перезапустите приложение вручную."
  echo "   Выполните на сервере:"
  echo "   ssh $SSH_HOST 'cd $DEPLOY_PATH && pm2 restart $PM2_NAME || pm2 start npm --name \"$PM2_NAME\" -- start'"
fi

echo ""
echo "✅ Деплой успешно завершен!"
echo ""
echo "🌐 Приложение доступно по адресу: https://myunion.pro"
echo ""
echo "Проверьте приложение:"
echo "  - Логи PM2: ssh $SSH_HOST 'pm2 logs $PM2_NAME'"
echo "  - Статус PM2: ssh $SSH_HOST 'pm2 status'"
echo "  - Логи systemd: ssh $SSH_HOST 'sudo journalctl -u $PM2_NAME -f'"
