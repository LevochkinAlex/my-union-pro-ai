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
chmod 644 /var/log/myunion/sync-discounts.log

# Удаляем старые cron-задания связанные со скидками
echo -e "${YELLOW}Очистка старых cron-заданий...${NC}"
crontab -l 2>/dev/null | grep -v "sync-discounts\|cron-sync-discounts" | crontab - 2>/dev/null || true

# Добавляем новое задание - запуск скрипта напрямую
# Синхронизация скидок каждый день в 03:00 по Москве (00:00 UTC)
CRON_JOB="0 0 * * * cd /opt/my-union-pro && /usr/bin/node scripts/sync-discounts.mjs >> /var/log/myunion/sync-discounts.log 2>&1"

(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}Cron-задание добавлено:${NC}"
echo -e "  ${YELLOW}0 0 * * * - Синхронизация скидок (03:00 МСК)${NC}"

# Проверяем cron
echo -e "\n${GREEN}Текущие cron-задания:${NC}"
crontab -l

echo -e "\n${GREEN}=== Настройка завершена ===${NC}"
echo -e "Синхронизация скидок: каждый день в 03:00 МСК"
echo -e "Логи: /var/log/myunion/sync-discounts.log"
echo -e "\nДля ручного запуска:"
echo -e "  cd /opt/my-union-pro && node scripts/sync-discounts.mjs"
