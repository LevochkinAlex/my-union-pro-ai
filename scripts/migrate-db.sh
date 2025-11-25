#!/bin/bash

# Скрипт для выполнения миграций Prisma на сервере
# Решает проблему с загрузкой DATABASE_URL из .env

set -e  # Exit on error

echo "🔧 Загрузка переменных окружения из .env..."

# Проверяем что мы в правильной директории
if [ ! -f ".env" ]; then
    echo "❌ Ошибка: .env файл не найден!"
    echo "   Убедитесь что вы находитесь в корне проекта /opt/my-union-pro"
    exit 1
fi

# Загружаем переменные из .env
set -a  # Automatically export all variables
source .env
set +a

# Проверяем что DATABASE_URL загружен
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Ошибка: DATABASE_URL не найден в .env файле!"
    exit 1
fi

echo "✅ Переменные окружения загружены"
echo ""

# Выполняем миграцию
if [ "$1" == "push" ]; then
    echo "🚀 Выполняем prisma db push (синхронизация схемы без миграций)..."
    npx prisma db push --skip-generate
elif [ "$1" == "dev" ]; then
    echo "🚀 Выполняем prisma migrate dev..."
    MIGRATION_NAME="${2:-auto_migration}"
    npx prisma migrate dev --name "$MIGRATION_NAME"
elif [ "$1" == "deploy" ]; then
    echo "🚀 Выполняем prisma migrate deploy (production)..."
    npx prisma migrate deploy
else
    echo "📋 Использование:"
    echo "  ./scripts/migrate-db.sh push              - Синхронизировать схему без создания миграции"
    echo "  ./scripts/migrate-db.sh dev [name]        - Создать и применить миграцию (development)"
    echo "  ./scripts/migrate-db.sh deploy            - Применить существующие миграции (production)"
    echo ""
    echo "💡 Пример: ./scripts/migrate-db.sh push"
    exit 0
fi

echo ""
echo "✅ Готово!"

