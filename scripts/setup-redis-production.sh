#!/bin/bash

# Скрипт для настройки Redis на продакшене
# Использование: ./scripts/setup-redis-production.sh

set -e

echo "🔧 Настройка Redis на продакшене..."

# Проверка, что скрипт запущен на сервере
if [ -z "$VDS_HOST" ]; then
    echo "❌ Ошибка: VDS_HOST не установлен"
    echo "Установите переменную окружения: export VDS_HOST=your-server-ip"
    exit 1
fi

# Подключение к серверу
echo "📡 Подключение к серверу $VDS_HOST..."

# Установка Redis (если не установлен)
ssh -i ~/.ssh/myunion_vds -o StrictHostKeyChecking=no root@$VDS_HOST << 'EOF'
    # Проверка установки Redis
    if ! command -v redis-server &> /dev/null; then
        echo "📦 Установка Redis..."
        apt-get update
        apt-get install -y redis-server
    else
        echo "✅ Redis уже установлен"
    fi

    # Настройка Redis
    echo "⚙️  Настройка Redis..."

    # Резервное копирование конфига
    cp /etc/redis/redis.conf /etc/redis/redis.conf.backup

    # Настройка для продакшена
    sed -i 's/^bind 127.0.0.1/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
    sed -i 's/^protected-mode yes/protected-mode yes/' /etc/redis/redis.conf
    
    # Установка пароля (если нужно)
    if [ -n "$REDIS_PASSWORD" ]; then
        echo "🔐 Установка пароля Redis..."
        sed -i "s/^# requirepass foobared/requirepass $REDIS_PASSWORD/" /etc/redis/redis.conf
    fi

    # Оптимизация для продакшена
    sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

    # Включение персистентности
    sed -i 's/^save 900 1/save 900 1/' /etc/redis/redis.conf
    sed -i 's/^save 300 10/save 300 10/' /etc/redis/redis.conf
    sed -i 's/^save 60 10000/save 60 10000/' /etc/redis/redis.conf

    # Перезапуск Redis
    echo "🔄 Перезапуск Redis..."
    systemctl restart redis-server
    systemctl enable redis-server

    # Проверка статуса
    if systemctl is-active --quiet redis-server; then
        echo "✅ Redis успешно запущен"
        redis-cli ping
    else
        echo "❌ Ошибка запуска Redis"
        systemctl status redis-server
        exit 1
    fi

    # Проверка подключения
    echo "🧪 Проверка подключения..."
    redis-cli ping
    echo "✅ Redis готов к работе"
EOF

echo ""
echo "✅ Настройка Redis завершена!"
echo ""
echo "📝 Добавьте в .env.local на сервере:"
echo "REDIS_URL=redis://localhost:6379"
echo "# или с паролем:"
echo "REDIS_URL=redis://:password@localhost:6379"
echo ""
echo "🔍 Проверка подключения:"
echo "ssh root@$VDS_HOST 'redis-cli ping'"

