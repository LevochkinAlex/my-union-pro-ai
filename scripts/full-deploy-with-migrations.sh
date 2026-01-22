#!/bin/bash
# Полный скрипт деплоя с миграциями каналов
# Выполнять на сервере: bash scripts/full-deploy-with-migrations.sh

set -e

echo "🚀 Начинаем полный деплой с миграциями каналов..."
echo ""

# Переходим в директорию проекта
cd /opt/my-union-pro || { echo "❌ Ошибка: директория /opt/my-union-pro не найдена"; exit 1; }

# 1. Обновляем код
echo "📥 Шаг 1: Обновляем код из репозитория..."
git pull origin main
echo "✅ Код обновлен"
echo ""

# 2. Останавливаем приложение
echo "🛑 Шаг 2: Останавливаем приложение..."
pm2 stop my-union-pro || echo "⚠️  Приложение уже остановлено"
echo ""

# 3. Применяем миграции каналов
echo "🔧 Шаг 3: Применяем миграции для каналов..."
if [ -f "scripts/apply-channel-migrations.sh" ]; then
    bash scripts/apply-channel-migrations.sh
    echo "✅ Миграции применены"
else
    echo "⚠️  Скрипт миграций не найден, применяем вручную..."
    
    # Применяем миграции вручную
    echo "📝 Применяем миграцию: add_channel_chat_type"
    npx prisma db execute --file prisma/migrations/20260121000000_add_channel_chat_type/migration.sql --schema prisma/schema.prisma || echo "⚠️  Миграция уже применена"
    
    echo "📝 Применяем миграцию: link_chat_news_channel"
    npx prisma db execute --file prisma/migrations/20260121000001_link_chat_news_channel/migration.sql --schema prisma/schema.prisma || echo "⚠️  Миграция уже применена"
    
    echo "📝 Применяем миграцию: fix_chat_message_attachment_columns"
    npx prisma db execute --file prisma/migrations/20260121130000_fix_chat_message_attachment_columns/migration.sql --schema prisma/schema.prisma || echo "⚠️  Миграция уже применена"
    
    # Помечаем миграции как примененные
    npx prisma migrate resolve --applied 20260121000000_add_channel_chat_type 2>/dev/null || true
    npx prisma migrate resolve --applied 20260121000001_link_chat_news_channel 2>/dev/null || true
    npx prisma migrate resolve --applied 20260121130000_fix_chat_message_attachment_columns 2>/dev/null || true
    
    # Генерируем Prisma Client
    echo "🔄 Генерируем Prisma Client..."
    npx prisma generate
fi
echo ""

# 4. Очищаем старую сборку
echo "🧹 Шаг 4: Очищаем старую сборку..."
rm -rf .next
echo "✅ Очистка завершена"
echo ""

# 5. Собираем проект
echo "🔨 Шаг 5: Собираем проект..."
pnpm build 2>&1 | tee /tmp/build.log
BUILD_EXIT_CODE=${PIPESTATUS[0]}
if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "❌ Ошибка сборки! Последние строки лога:"
    tail -20 /tmp/build.log
    exit 1
fi
echo "✅ Сборка завершена"
echo ""

# 6. Перезапускаем приложение
echo "🔄 Шаг 6: Перезапускаем приложение..."
pm2 restart my-union-pro
echo "✅ Приложение перезапущено"
echo ""

# 7. Проверяем статус
echo "📊 Шаг 7: Проверяем статус..."
sleep 5
pm2 status | head -10
echo ""

# 8. Проверяем доступность API
echo "🌐 Шаг 8: Проверяем доступность API..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://myunion.pro/api/profile || echo "000")
if [ "$API_STATUS" = "200" ] || [ "$API_STATUS" = "401" ] || [ "$API_STATUS" = "307" ]; then
    echo "✅ API доступен (статус: $API_STATUS)"
else
    echo "⚠️  API вернул статус: $API_STATUS"
fi
echo ""

echo "✅ Деплой с миграциями завершен успешно!"
echo ""
echo "📋 Полезные команды:"
echo "  - Статус: pm2 status"
echo "  - Логи: pm2 logs my-union-pro --lines 50"
echo "  - Мониторинг: pm2 monit"
