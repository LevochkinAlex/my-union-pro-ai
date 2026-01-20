#!/bin/bash

# Скрипт для полного удаления Matrix/Synapse с сервера

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        ПОЛНОЕ УДАЛЕНИЕ MATRIX/SYNAPSE С СЕРВЕРА           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Остановка и удаление Docker контейнера Synapse
echo "🐳 Останавливаем и удаляем Docker контейнер Synapse..."
if docker ps -a | grep -q synapse; then
    docker stop synapse 2>/dev/null || true
    docker rm synapse 2>/dev/null || true
    echo -e "${GREEN}✅ Контейнер Synapse удален${NC}"
else
    echo -e "${YELLOW}⏭️  Контейнер Synapse не найден${NC}"
fi

# 2. Удаление Docker image
echo ""
echo "🗑️  Удаляем Docker image matrixdotorg/synapse..."
if docker images | grep -q matrixdotorg/synapse; then
    docker rmi matrixdotorg/synapse:latest 2>/dev/null || true
    echo -e "${GREEN}✅ Image удален${NC}"
else
    echo -e "${YELLOW}⏭️  Image не найден${NC}"
fi

# 3. Удаление данных Synapse
echo ""
echo "🗑️  Удаляем данные Synapse..."
SYNAPSE_DATA_DIR="/opt/synapse-data"
if [ -d "$SYNAPSE_DATA_DIR" ]; then
    rm -rf "$SYNAPSE_DATA_DIR"
    echo -e "${GREEN}✅ Данные Synapse удалены: $SYNAPSE_DATA_DIR${NC}"
else
    echo -e "${YELLOW}⏭️  Директория данных не найдена${NC}"
fi

# 4. Удаление конфигурации Synapse
echo ""
echo "🗑️  Удаляем конфигурацию Synapse..."
SYNAPSE_CONFIG_DIR="/etc/synapse"
if [ -d "$SYNAPSE_CONFIG_DIR" ]; then
    rm -rf "$SYNAPSE_CONFIG_DIR"
    echo -e "${GREEN}✅ Конфигурация удалена: $SYNAPSE_CONFIG_DIR${NC}"
else
    echo -e "${YELLOW}⏭️  Директория конфигурации не найдена${NC}"
fi

# 5. Удаление logов Synapse
echo ""
echo "🗑️  Удаляем логи Synapse..."
SYNAPSE_LOGS_DIR="/var/log/synapse"
if [ -d "$SYNAPSE_LOGS_DIR" ]; then
    rm -rf "$SYNAPSE_LOGS_DIR"
    echo -e "${GREEN}✅ Логи удалены: $SYNAPSE_LOGS_DIR${NC}"
else
    echo -e "${YELLOW}⏭️  Директория логов не найдена${NC}"
fi

# 6. Останавливаем matrix-bot если он запущен
echo ""
echo "🤖 Останавливаем matrix-bot..."
if pm2 list | grep -q matrix-bot; then
    pm2 delete matrix-bot 2>/dev/null || true
    echo -e "${GREEN}✅ matrix-bot остановлен и удален из PM2${NC}"
else
    echo -e "${YELLOW}⏭️  matrix-bot не найден в PM2${NC}"
fi

# 7. Удаляем скрипт matrix-bot
echo ""
echo "🗑️  Удаляем скрипт matrix-bot..."
if [ -f "/opt/my-union-pro/scripts/matrix-bot.ts" ]; then
    rm -f "/opt/my-union-pro/scripts/matrix-bot.ts"
    echo -e "${GREEN}✅ matrix-bot.ts удален${NC}"
else
    echo -e "${YELLOW}⏭️  matrix-bot.ts не найден${NC}"
fi

# 8. Очистка неиспользуемых Docker ресурсов
echo ""
echo "🧹 Очищаем неиспользуемые Docker ресурсы..."
docker system prune -f 2>/dev/null || true
echo -e "${GREEN}✅ Docker ресурсы очищены${NC}"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    УДАЛЕНИЕ ЗАВЕРШЕНО                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ Matrix/Synapse полностью удален с сервера!${NC}"
echo ""
echo "📝 Что дальше:"
echo "   1. Убедитесь что приложение работает без Matrix"
echo "   2. Запустите скрипт для создания ИИ чатов:"
echo "      cd /opt/my-union-pro && tsx scripts/create-ai-chats-for-all-users.ts"
echo ""
