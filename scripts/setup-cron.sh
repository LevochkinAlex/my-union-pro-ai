#!/bin/bash

# Скрипт для настройки cron-заданий на сервере
# Запускать на VDS: bash /opt/my-union-pro/scripts/setup-cron.sh

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Настройка Cron для MyUnion Pro ===${NC}"

# Проверяем что запущено от root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Ошибка: запустите скрипт от root${NC}"
    exit 1
fi

# Создаем директорию для логов
mkdir -p /var/log/myunion
touch /var/log/myunion/sync-discounts.log
touch /var/log/myunion/sync-user-discounts.log
chmod 644 /var/log/myunion/sync-discounts.log
chmod 644 /var/log/myunion/sync-user-discounts.log

# Удаляем старые cron-задания связанные со скидками
echo -e "${YELLOW}Очистка старых cron-заданий...${NC}"
crontab -l 2>/dev/null | grep -v "sync-discounts\|sync-user-discounts\|cron-sync" | crontab - 2>/dev/null || true

# 1. Синхронизация каталога скидок — 03:00 МСК (00:00 UTC)
CRON_CATALOG="0 0 * * * cd /opt/my-union-pro && /usr/bin/node scripts/sync-discounts.mjs >> /var/log/myunion/sync-discounts.log 2>&1"

# 2. Синхронизация скидок пользователей — 04:00 МСК (01:00 UTC), после каталога
CRON_USERS="0 1 * * * cd /opt/my-union-pro && pnpm exec tsx scripts/sync-all-users-discounts.ts >> /var/log/myunion/sync-user-discounts.log 2>&1"

(crontab -l 2>/dev/null; echo "$CRON_CATALOG"; echo "$CRON_USERS") | crontab -

echo -e "${GREEN}Cron-задания добавлены:${NC}"
echo -e "  ${YELLOW}0 0 * * * - Каталог скидок (03:00 МСК)${NC}"
echo -e "  ${YELLOW}0 1 * * * - Скидки пользователей (04:00 МСК)${NC}"

# Проверяем cron
echo -e "\n${GREEN}Текущие cron-задания:${NC}"
crontab -l

echo -e "\n${GREEN}=== Настройка завершена ===${NC}"
echo -e "Логи:"
echo -e "  /var/log/myunion/sync-discounts.log"
echo -e "  /var/log/myunion/sync-user-discounts.log"
echo -e "\nРучной запуск:"
echo -e "  pnpm sync:discounts"
echo -e "  pnpm sync:all-users-discounts"
