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
touch /var/log/myunion/partner-liquidation.log
touch /var/log/myunion/partner-venue-sla.log
chmod 644 /var/log/myunion/sync-discounts.log
chmod 644 /var/log/myunion/sync-user-discounts.log
chmod 644 /var/log/myunion/partner-liquidation.log
chmod 644 /var/log/myunion/partner-venue-sla.log

# Удаляем старые задания MyUnion: блок с маркерами + устаревшие строки без маркеров
echo -e "${YELLOW}Очистка старых cron-заданий MyUnion...${NC}"
crontab -l 2>/dev/null | awk '
  /^# --- MYUNION_CRON start ---$/ { skip=1; next }
  /^# --- MYUNION_CRON end ---$/ { skip=0; next }
  !skip { print }
' | grep -v "sync-discounts\|sync-user-discounts\|cron-sync\|run-partner-liquidation-cron\|run-partner-venue-sla-cron\|check-partner-liquidation" | crontab - 2>/dev/null || true

# Каталог приложения на сервере (deploy.sh передаёт APP_ROOT=VDS_PATH)
APP_ROOT="${APP_ROOT:-/opt/my-union-pro}"

# CRON_TZ=UTC: расписание не зависит от TZ сервера (часто Europe/Moscow).
# Явный /usr/bin/node + tsx/dist/cli.mjs: шим .bin/tsx вызывает «node» из PATH — в cron часто пусто/другой Node.
# tsx-скрипты оборачиваем в `dotenv -c`: тот же каскад .env / .env.local, что у `pnpm start` (иначе DATABASE_URL пустой).
# Каталог скидок: каждые 15 минут (импорт с BB на VDS через tsx).
MYUNION_BLOCK=$(cat <<EOF
# --- MYUNION_CRON start ---
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SHELL=/bin/bash
CRON_TZ=UTC
*/15 * * * * cd $APP_ROOT && $APP_ROOT/node_modules/.bin/dotenv -c -- /usr/bin/node $APP_ROOT/node_modules/tsx/dist/cli.mjs scripts/sync-discounts.ts >> /var/log/myunion/sync-discounts.log 2>&1
0 1 * * * cd $APP_ROOT && $APP_ROOT/node_modules/.bin/dotenv -c -- /usr/bin/node $APP_ROOT/node_modules/tsx/dist/cli.mjs scripts/sync-all-users-discounts.ts >> /var/log/myunion/sync-user-discounts.log 2>&1
*/15 * * * * cd $APP_ROOT && $APP_ROOT/node_modules/.bin/dotenv -c -- /usr/bin/node $APP_ROOT/node_modules/tsx/dist/cli.mjs scripts/run-partner-venue-sla-cron.ts >> /var/log/myunion/partner-venue-sla.log 2>&1
# ЕГРЮЛ / ликвидация партнёров: каждый день в 02:00 UTC (поля: мин час день месяц день_недели)
0 2 * * * cd $APP_ROOT && $APP_ROOT/node_modules/.bin/dotenv -c -- /usr/bin/node $APP_ROOT/node_modules/tsx/dist/cli.mjs scripts/run-partner-liquidation-cron.ts >> /var/log/myunion/partner-liquidation.log 2>&1
# --- MYUNION_CRON end ---
EOF
)

{ crontab -l 2>/dev/null; echo "$MYUNION_BLOCK"; } | crontab -

echo -e "${GREEN}Cron-задания добавлены (CRON_TZ=UTC):${NC}"
echo -e "  ${YELLOW}*/15 — каталог скидок (каждые 15 мин, полный импорт с BB)${NC}"
echo -e "  ${YELLOW}0 1 — скидки пользователей (04:00 МСК)${NC}"
echo -e "  ${YELLOW}*/15 — SLA заявок партнёров (напоминания, скрытие в каталоге)${NC}"
echo -e "  ${YELLOW}0 2 — ЕГРЮЛ партнёров (02:00 UTC, 05:00 МСК)${NC}"

# Проверяем cron
echo -e "\n${GREEN}Текущие cron-задания:${NC}"
crontab -l

echo -e "\n${GREEN}=== Настройка завершена ===${NC}"
echo -e "Логи:"
echo -e "  /var/log/myunion/sync-discounts.log"
echo -e "  /var/log/myunion/sync-user-discounts.log"
echo -e "  /var/log/myunion/partner-liquidation.log"
echo -e "  /var/log/myunion/partner-venue-sla.log"
echo -e "\nРучной запуск:"
echo -e "  pnpm sync:discounts"
echo -e "  pnpm sync:all-users-discounts"
echo -e "  pnpm cron:partner-liquidation"
echo -e "  pnpm cron:partner-venue-sla"
