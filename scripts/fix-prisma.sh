#!/bin/bash

# Скрипт для автоматического исправления проблем с Prisma
# Использование: ./scripts/fix-prisma.sh

set -e

echo "🔧 Проверка и исправление проблем с Prisma..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверяем наличие .env.local
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  Файл .env.local не найден. Пропускаем валидацию схемы.${NC}"
    SKIP_VALIDATE=true
else
    SKIP_VALIDATE=false
fi

# 1. Генерируем Prisma Client
echo -e "${GREEN}📦 Генерация Prisma Client...${NC}"
if [ "$SKIP_VALIDATE" = true ]; then
    npx prisma generate --schema=./prisma/schema.prisma || {
        echo -e "${RED}❌ Ошибка генерации Prisma Client${NC}"
        exit 1
    }
else
    npx dotenv -e .env.local -- prisma generate || {
        echo -e "${RED}❌ Ошибка генерации Prisma Client${NC}"
        exit 1
    }
fi

# 2. Валидация схемы (если есть .env.local)
if [ "$SKIP_VALIDATE" = false ]; then
    echo -e "${GREEN}✅ Валидация Prisma схемы...${NC}"
    npx dotenv -e .env.local -- prisma validate || {
        echo -e "${YELLOW}⚠️  Предупреждение: схема не прошла валидацию, но продолжаем...${NC}"
    }
fi

# 3. Проверяем наличие сгенерированного клиента
if [ ! -d "node_modules/.prisma/client" ] && [ ! -d "node_modules/@prisma/client" ]; then
    echo -e "${RED}❌ Prisma Client не найден после генерации!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prisma Client успешно сгенерирован!${NC}"

# 4. Проверяем импорты в основных файлах
echo -e "${GREEN}🔍 Проверка импортов...${NC}"

# Проверяем lib/prisma.ts
if grep -q "from '@prisma/client'" lib/prisma.ts 2>/dev/null; then
    echo -e "${GREEN}✅ lib/prisma.ts: импорт корректен${NC}"
else
    echo -e "${YELLOW}⚠️  lib/prisma.ts: возможна проблема с импортом${NC}"
fi

echo -e "${GREEN}✨ Все проверки завершены!${NC}"

