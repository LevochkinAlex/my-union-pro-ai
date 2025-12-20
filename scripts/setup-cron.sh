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

# Загружаем переменные окружения
if [ -f /opt/my-union-pro/.env ]; then
    source /opt/my-union-pro/.env
fi

# Проверяем наличие CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
    # Генерируем новый секретный ключ
    CRON_SECRET=$(openssl rand -hex 32)
    echo -e "${YELLOW}Генерируем новый CRON_SECRET...${NC}"
    
    # Добавляем в .env если его там нет
    if ! grep -q "CRON_SECRET=" /opt/my-union-pro/.env 2>/dev/null; then
        echo "" >> /opt/my-union-pro/.env
        echo "# Секретный ключ для cron-заданий" >> /opt/my-union-pro/.env
        echo "CRON_SECRET=$CRON_SECRET" >> /opt/my-union-pro/.env
        echo -e "${GREEN}CRON_SECRET добавлен в .env${NC}"
    fi
fi

# Создаем скрипт для вызова cron API
cat > /opt/my-union-pro/scripts/cron-sync-discounts.sh << 'EOF'
#!/bin/bash
# Скрипт синхронизации скидок (вызывается cron)

# Загружаем переменные окружения
source /opt/my-union-pro/.env

# Вызываем API
curl -s -X GET \
    -H "Authorization: Bearer $CRON_SECRET" \
    "http://localhost:3000/api/cron/sync-discounts" \
    >> /var/log/myunion-sync.log 2>&1

echo "" >> /var/log/myunion-sync.log
echo "--- $(date) ---" >> /var/log/myunion-sync.log
EOF

chmod +x /opt/my-union-pro/scripts/cron-sync-discounts.sh
echo -e "${GREEN}Создан скрипт cron-sync-discounts.sh${NC}"

# Создаем лог-файл
touch /var/log/myunion-sync.log
chmod 644 /var/log/myunion-sync.log

# Добавляем задание в crontab
CRON_JOB="0 3 * * * /opt/my-union-pro/scripts/cron-sync-discounts.sh"

# Проверяем, есть ли уже такое задание
if crontab -l 2>/dev/null | grep -q "cron-sync-discounts"; then
    echo -e "${YELLOW}Cron-задание уже существует, обновляем...${NC}"
    # Удаляем старое задание
    crontab -l 2>/dev/null | grep -v "cron-sync-discounts" | crontab -
fi

# Добавляем новое задание
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}Cron-задание добавлено:${NC}"
echo -e "  ${YELLOW}$CRON_JOB${NC}"

# Проверяем cron
echo -e "\n${GREEN}Текущие cron-задания:${NC}"
crontab -l

# Перезапускаем pm2 чтобы подхватить новый CRON_SECRET
echo -e "\n${YELLOW}Перезапуск приложения для применения CRON_SECRET...${NC}"
cd /opt/my-union-pro && pm2 restart my-union-pro

echo -e "\n${GREEN}=== Настройка завершена ===${NC}"
echo -e "Синхронизация скидок будет запускаться каждый день в 03:00"
echo -e "Логи доступны в: /var/log/myunion-sync.log"
echo -e "\nДля ручного запуска: /opt/my-union-pro/scripts/cron-sync-discounts.sh"

